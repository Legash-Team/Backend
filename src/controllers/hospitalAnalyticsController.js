const Hospital = require('../models/Hospital');
const HospitalStockSnapshot = require('../models/HospitalStockSnapshot');
const BloodRequest = require('../models/BloodRequest');
const BloodCenterRequest = require('../models/BloodCenterRequest');
const BloodRequestResponse = require('../models/BloodRequestResponse');
const BloodCenterRequestResponse = require('../models/BloodCenterRequestResponse');
const { VALID_BLOOD_TYPES } = require('../utils/bloodCompatibility');
const {
  parseBloodTypeQuery,
  buildStockMap,
  SNAPSHOT_TIMEZONE
} = require('../utils/hospitalStockHelpers');

// GET /api/superadmin/hospitals/stock
async function getHospitalStock(req, res, next) {
  try {
    const {
      bloodType: rawBloodType,
      sortBy = 'hospitalName',
      order = 'asc',
      page = '1',
      limit = '20'
    } = req.query;

    // Validate bloodType query parameter
    const parsedBloodType = parseBloodTypeQuery(rawBloodType);
    if (parsedBloodType.error) {
      return res.status(400).json({ success: false, error: parsedBloodType.error });
    }
    const bloodTypeFilter = parsedBloodType.value;

    // Validate sortBy
    if (typeof sortBy !== 'string' || !['hospitalName', 'totalUnits'].includes(sortBy)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid sortBy. Allowed: hospitalName, totalUnits'
      });
    }

    // Validate order
    if (typeof order !== 'string' || !['asc', 'desc'].includes(order)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid order. Allowed: asc, desc'
      });
    }

    // Validate page
    if (typeof page !== 'string' || !/^\d+$/.test(page) || parseInt(page, 10) < 1) {
      return res.status(400).json({
        success: false,
        error: 'Invalid page. Must be a positive integer >= 1.'
      });
    }
    const pageNum = parseInt(page, 10);

    // Validate limit
    if (
      typeof limit !== 'string' ||
      !/^\d+$/.test(limit) ||
      parseInt(limit, 10) < 1 ||
      parseInt(limit, 10) > 100
    ) {
      return res.status(400).json({
        success: false,
        error: 'Invalid limit. Must be an integer between 1 and 100.'
      });
    }
    const limitNum = parseInt(limit, 10);

    // Stage 1: Match approved, non-deleted hospitals
    const matchStage = {
      $match: {
        verificationStatus: 'approved',
        isDeleted: { $ne: true }
      }
    };

    // Stage 2: Calculate totalUnits used for sorting
    const addFieldsStage = {
      $addFields: {
        totalUnits: bloodTypeFilter
          ? {
              $sum: {
                $map: {
                  input: {
                    $filter: {
                      input: { $ifNull: ['$bloodStock', []] },
                      as: 'item',
                      cond: { $eq: ['$$item.bloodType', bloodTypeFilter] }
                    }
                  },
                  as: 'item',
                  in: {
                    $cond: [{ $gt: ['$$item.availableUnits', 0] }, '$$item.availableUnits', 0]
                  }
                }
              }
            }
          : {
              $sum: {
                $map: {
                  input: { $ifNull: ['$bloodStock', []] },
                  as: 'item',
                  in: {
                    $cond: [{ $gt: ['$$item.availableUnits', 0] }, '$$item.availableUnits', 0]
                  }
                }
              }
            }
      }
    };

    // Stage 3: Sort by requested field with stable tie-breakers
    const sortDir = order === 'asc' ? 1 : -1;
    const sortStage = {
      $sort:
        sortBy === 'totalUnits'
          ? { totalUnits: sortDir, hospitalName: 1, _id: 1 }
          : { hospitalName: sortDir, _id: 1 }
    };

    // Stage 4: Facet pagination and total count
    const facetStage = {
      $facet: {
        rows: [
          { $skip: (pageNum - 1) * limitNum },
          { $limit: limitNum },
          {
            $project: {
              hospitalName: 1,
              phone: 1,
              'location.coordinates': 1,
              'location.address': 1,
              bloodStock: 1
            }
          }
        ],
        total: [{ $count: 'count' }]
      }
    };

    const pipeline = [matchStage, addFieldsStage, sortStage, facetStage];
    const aggregationResult = await Hospital.aggregate(pipeline).collation({
      locale: 'en',
      strength: 2
    });

    const facet = aggregationResult[0] || {};
    const rows = facet.rows || [];
    const total = facet.total?.[0]?.count || 0;
    const totalPages = total === 0 ? 0 : Math.ceil(total / limitNum);

    const hospitals = rows.map((h) => {
      const stock = buildStockMap(h.bloodStock, bloodTypeFilter);
      const rowTotalUnits = Object.values(stock).reduce((sum, u) => sum + u, 0);
      const lat = h.location?.coordinates?.[1] ?? null;
      const lng = h.location?.coordinates?.[0] ?? null;
      const address = h.location?.address ?? '';

      return {
        id: h._id.toString(),
        hospitalName: h.hospitalName,
        phone: h.phone,
        location: {
          lat,
          lng,
          address
        },
        stock,
        totalUnits: rowTotalUnits
      };
    });

    return res.status(200).json({
      success: true,
      hospitals,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages
      }
    });
  } catch (error) {
    next(error);
  }
}

// GET /api/superadmin/analytics/hospitals
async function getHospitalAnalytics(req, res, next) {
  try {
    const now = new Date();
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Live aggregation: extract safe per-bloodType units taking first entry per type
    const bloodTypeFields = {};
    const bloodTypeSums = {};
    for (const bt of VALID_BLOOD_TYPES) {
      const safeKey = bt.replace('+', '_plus').replace('-', '_minus');
      bloodTypeFields[safeKey] = {
        $let: {
          vars: {
            entry: {
              $first: {
                $filter: {
                  input: { $ifNull: ['$bloodStock', []] },
                  as: 's',
                  cond: { $eq: ['$$s.bloodType', bt] }
                }
              }
            }
          },
          in: {
            $cond: [{ $gt: ['$$entry.availableUnits', 0] }, '$$entry.availableUnits', 0]
          }
        }
      };
      bloodTypeSums[bt] = { $sum: `$${safeKey}` };
    }

    const livePipeline = [
      // Filter approved, non-deleted hospitals
      {
        $match: {
          verificationStatus: 'approved',
          isDeleted: { $ne: true }
        }
      },
      // Extract available units per type
      {
        $addFields: bloodTypeFields
      },
      // Compute totalUnits for each hospital
      {
        $addFields: {
          totalUnits: {
            $add: VALID_BLOOD_TYPES.map(
              (bt) => `$${bt.replace('+', '_plus').replace('-', '_minus')}`
            )
          }
        }
      },
      // Facet summary, top 10, bottom 10
      {
        $facet: {
          summary: [
            {
              $group: {
                _id: null,
                count: { $sum: 1 },
                totalUnits: { $sum: '$totalUnits' },
                ...bloodTypeSums
              }
            }
          ],
          topHospitals: [
            { $sort: { totalUnits: -1, hospitalName: 1, _id: 1 } },
            { $limit: 10 },
            { $project: { _id: 1, hospitalName: 1, totalUnits: 1 } }
          ],
          bottomHospitals: [
            { $sort: { totalUnits: 1, hospitalName: 1, _id: 1 } },
            { $limit: 10 },
            { $project: { _id: 1, hospitalName: 1, totalUnits: 1 } }
          ]
        }
      }
    ];

    // Trends aggregation: past 90 days daily latest snapshot
    const trendsPipeline = [
      // Filter snapshots from past 90 days
      {
        $match: {
          recordedAt: { $gte: ninetyDaysAgo }
        }
      },
      // (1) Group by run time and bloodType summing availableUnits
      {
        $group: {
          _id: {
            recordedAt: '$recordedAt',
            bloodType: '$bloodType'
          },
          units: { $sum: '$availableUnits' }
        }
      },
      // (2) Group by run time collecting per-type sums and total
      {
        $group: {
          _id: '$_id.recordedAt',
          types: {
            $push: {
              bloodType: '$_id.bloodType',
              units: '$units'
            }
          },
          totalUnits: { $sum: '$units' }
        }
      },
      // (3) Add day formatted in Addis Ababa timezone
      {
        $addFields: {
          recordedAt: '$_id',
          day: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$_id',
              timezone: SNAPSHOT_TIMEZONE
            }
          }
        }
      },
      // (4) Sort by run time descending so latest run of day comes first
      {
        $sort: {
          recordedAt: -1
        }
      },
      // (5) Group by day taking the latest run of that day
      {
        $group: {
          _id: '$day',
          latestRun: {
            $first: {
              recordedAt: '$recordedAt',
              types: '$types',
              totalUnits: '$totalUnits'
            }
          }
        }
      },
      // (6) Sort days ascending chronologically
      {
        $sort: {
          _id: 1
        }
      }
    ];

    const [liveResult, trendsRaw, needResult] = await Promise.all([
      Hospital.aggregate(livePipeline).collation({ locale: 'en', strength: 2 }),
      HospitalStockSnapshot.aggregate(trendsPipeline),
      BloodRequest.aggregate([
        {
          $match: {
            status: 'open',
            closesAt: { $gt: now }
          }
        },
        {
          $group: {
            _id: '$bloodType',
            totalNeed: { $sum: '$quantityNeeded' }
          }
        }
      ])
    ]);

    const liveFacet = liveResult[0] || {};
    const summary = liveFacet.summary?.[0] || null;

    const approvedHospitalCount = summary?.count || 0;
    const nationalTotalUnits = summary?.totalUnits || 0;
    const nationalByBloodType = {};
    for (const bt of VALID_BLOOD_TYPES) {
      nationalByBloodType[bt] = summary?.[bt] || 0;
    }

    const nationalNeedByBloodType = {};
    for (const bt of VALID_BLOOD_TYPES) {
      nationalNeedByBloodType[bt] = 0;
    }
    for (const item of needResult) {
      if (item._id && nationalNeedByBloodType[item._id] !== undefined) {
        nationalNeedByBloodType[item._id] = item.totalNeed;
      }
    }

    const needVsSupply = VALID_BLOOD_TYPES.map((bt) => ({
      bloodType: bt,
      need: nationalNeedByBloodType[bt] || 0,
      supply: nationalByBloodType[bt] || 0
    }));

    // Weekly Demand & Supply Aggregation (past 8 weeks ending with current week)
    const weeks = [];
    const d = new Date(now);
    const day = d.getDay();
    const diffToMon = d.getDate() - day + (day === 0 ? -6 : 1);
    const currentMonday = new Date(d.setDate(diffToMon));
    currentMonday.setHours(0, 0, 0, 0);

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    for (let i = 7; i >= 0; i--) {
      const start = new Date(currentMonday.getTime() - i * 7 * 24 * 60 * 60 * 1000);
      const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);
      const label = `${monthNames[start.getMonth()]} ${String(start.getDate()).padStart(2, '0')}`;
      weeks.push({
        start,
        end,
        weekLabel: label,
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10)
      });
    }

    const earliestWeek = weeks[0].start;
    const latestWeek = weeks[weeks.length - 1].end;

    const [donorReqs, centerReqs, snapshotsInRange, approvedHospitals, acceptedDonorResponses, acceptedCenterResponses] = await Promise.all([
      BloodRequest.find({ createdAt: { $gte: earliestWeek, $lte: latestWeek } }).lean(),
      BloodCenterRequest.find({ createdAt: { $gte: earliestWeek, $lte: latestWeek } }).lean(),
      HospitalStockSnapshot.find({ recordedAt: { $gte: earliestWeek, $lte: latestWeek } }).lean(),
      Hospital.find({ verificationStatus: 'approved', isDeleted: { $ne: true } }).lean(),
      BloodRequestResponse.find({ status: 'accepted' }).populate('bloodRequest').lean(),
      BloodCenterRequestResponse.find({ status: 'accepted' }).populate('request').lean()
    ]);

    const weeklyNeedVsSupply = weeks.map((w, index) => {
      const isCurrentWeek = index === weeks.length - 1;
      const wDonor = donorReqs.filter((r) => r.createdAt >= w.start && r.createdAt <= w.end);
      const wCenter = centerReqs.filter((r) => r.createdAt >= w.start && r.createdAt <= w.end);
      const wSnaps = snapshotsInRange.filter((s) => s.recordedAt >= w.start && s.recordedAt <= w.end);

      // Filter accepted responses for this week
      const wDonorResponses = acceptedDonorResponses.filter((r) => {
        const d = r.respondedAt || r.createdAt;
        return d >= w.start && d <= w.end;
      });

      // Group accepted donor responses by request to cap at quantityNeeded and prevent duplicate counts
      const donorFulfilledByReq = {};
      wDonorResponses.forEach((r) => {
        if (!r.bloodRequest) return;
        const reqId = r.bloodRequest._id.toString();
        const bType = r.bloodRequest.bloodType;
        if (!donorFulfilledByReq[reqId]) {
          donorFulfilledByReq[reqId] = {
            bloodType: bType,
            quantityNeeded: r.bloodRequest.quantityNeeded || 1,
            count: 0
          };
        }
        donorFulfilledByReq[reqId].count++;
      });

      // Filter accepted blood center responses for this week
      const wCenterResponses = acceptedCenterResponses.filter((r) => {
        const d = r.respondedAt || r.createdAt;
        return d >= w.start && d <= w.end;
      });

      // Group blood center responses by request to avoid counting the same request more than once
      const centerFulfilledByReq = {};
      wCenterResponses.forEach((r) => {
        if (!r.request) return;
        const reqId = r.request._id.toString();
        const bType = r.request.bloodType;
        if (!centerFulfilledByReq[reqId]) {
          centerFulfilledByReq[reqId] = {
            bloodType: bType,
            quantityNeeded: r.request.quantityNeeded || 1
          };
        }
      });

      const byBloodType = {};
      for (const bt of VALID_BLOOD_TYPES) {
        const donorUnits = wDonor
          .filter((r) => r.bloodType === bt)
          .reduce((acc, r) => acc + (r.quantityNeeded || 0), 0);
        const centerUnits = wCenter
          .filter((r) => r.bloodType === bt)
          .reduce((acc, r) => acc + (r.quantityNeeded || 0), 0);
        const donorFulfilled = Object.values(donorFulfilledByReq)
          .filter((item) => item.bloodType === bt)
          .reduce((acc, item) => acc + Math.min(item.count, item.quantityNeeded), 0);
        const centerFulfilled = Object.values(centerFulfilledByReq)
          .filter((item) => item.bloodType === bt)
          .reduce((acc, item) => acc + item.quantityNeeded, 0);

        let supplyUnits = 0;
        if (wSnaps.length > 0) {
          const hospitalLatest = {};
          for (const snap of wSnaps) {
            if (snap.bloodType === bt) {
              const hId = snap.hospital.toString();
              if (!hospitalLatest[hId] || hospitalLatest[hId].recordedAt < snap.recordedAt) {
                hospitalLatest[hId] = snap;
              }
            }
          }
          supplyUnits = Object.values(hospitalLatest).reduce((acc, s) => acc + (s.availableUnits || 0), 0);
        } else if (isCurrentWeek) {
          supplyUnits = approvedHospitals.reduce((acc, h) => {
            const item = (h.bloodStock || []).find((b) => b.bloodType === bt);
            return acc + (item ? (item.availableUnits || 0) : 0);
          }, 0);
        }

        byBloodType[bt] = {
          demand: donorUnits + centerUnits,
          donorDemand: donorUnits,
          bloodCenterDemand: centerUnits,
          fulfilledDemand: donorFulfilled + centerFulfilled,
          supply: supplyUnits
        };
      }

      const totalDemand = Object.values(byBloodType).reduce((acc, b) => acc + b.demand, 0);
      const totalDonorDemand = Object.values(byBloodType).reduce((acc, b) => acc + b.donorDemand, 0);
      const totalBloodCenterDemand = Object.values(byBloodType).reduce((acc, b) => acc + b.bloodCenterDemand, 0);
      const totalFulfilled = Object.values(byBloodType).reduce((acc, b) => acc + b.fulfilledDemand, 0);
      const totalSupply = Object.values(byBloodType).reduce((acc, b) => acc + b.supply, 0);

      return {
        week: w.startDate,
        weekLabel: w.weekLabel,
        demand: totalDemand,
        donorDemand: totalDonorDemand,
        bloodCenterDemand: totalBloodCenterDemand,
        fulfilledDemand: totalFulfilled,
        supply: totalSupply,
        byBloodType
      };
    });

    const topHospitals = (liveFacet.topHospitals || []).map((h) => ({
      id: h._id.toString(),
      hospitalName: h.hospitalName,
      totalUnits: h.totalUnits
    }));

    const bottomHospitals = (liveFacet.bottomHospitals || []).map((h) => ({
      id: h._id.toString(),
      hospitalName: h.hospitalName,
      totalUnits: h.totalUnits
    }));

    // Shape trends in JavaScript
    const last90Days = trendsRaw.map((doc) => {
      const byBloodType = {};
      for (const bt of VALID_BLOOD_TYPES) {
        const match = (doc.latestRun?.types || []).find((t) => t.bloodType === bt);
        byBloodType[bt] = match ? match.units : 0;
      }
      return {
        date: doc._id,
        recordedAt: doc.latestRun.recordedAt.toISOString(),
        totalUnits: doc.latestRun.totalUnits,
        byBloodType
      };
    });

    const last30Days = last90Days.filter((p) => new Date(p.recordedAt) >= thirtyDaysAgo);

    return res.status(200).json({
      success: true,
      analytics: {
        generatedAt: now.toISOString(),
        approvedHospitalCount,
        national: {
          totalUnits: nationalTotalUnits,
          byBloodType: nationalByBloodType
        },
        needVsSupply,
        weeklyNeedVsSupply,
        nationalNeed: nationalNeedByBloodType,
        topHospitals,
        bottomHospitals,
        trends: {
          last30Days,
          last90Days
        }
      },
      data: {
        nationalTotals: nationalByBloodType,
        nationalNeed: nationalNeedByBloodType,
        needVsSupply,
        weeklyNeedVsSupply,
        topHospitals,
        bottomHospitals,
        trends: last30Days.map((t) => ({ date: t.date, ...t.byBloodType }))
      }
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getHospitalStock,
  getHospitalAnalytics
};
