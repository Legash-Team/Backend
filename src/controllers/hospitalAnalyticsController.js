const Hospital = require('../models/Hospital');
const HospitalStockSnapshot = require('../models/HospitalStockSnapshot');
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

    const [liveResult, trendsRaw] = await Promise.all([
      Hospital.aggregate(livePipeline).collation({ locale: 'en', strength: 2 }),
      HospitalStockSnapshot.aggregate(trendsPipeline)
    ]);

    const liveFacet = liveResult[0] || {};
    const summary = liveFacet.summary?.[0] || null;

    const approvedHospitalCount = summary?.count || 0;
    const nationalTotalUnits = summary?.totalUnits || 0;
    const nationalByBloodType = {};
    for (const bt of VALID_BLOOD_TYPES) {
      nationalByBloodType[bt] = summary?.[bt] || 0;
    }

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
        topHospitals,
        bottomHospitals,
        trends: {
          last30Days,
          last90Days
        }
      },
      data: {
        nationalTotals: nationalByBloodType,
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
