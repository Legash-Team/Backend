# Legash — Backend API

Legash is a Smart Blood Donation Management System designed to streamline blood requests, hospital validations, compatible donor matching, blood inventory management, and blood donation campaigns.

This repository, **legash-backend**, contains the server-side application that powers the Legash web and mobile platforms. It provides RESTful APIs, manages application data, handles authentication and authorization, coordinates blood donation workflows, and connects the different subsystems of the platform.

---

## Repository Information

**Project:** Legash — Smart Blood Donation Management System

**Repository:** `Legash-Team/Backend`

**Architecture:** RESTful API with a modular server-side architecture.

**Primary Responsibility:** Backend services, business logic, database operations, integrations, and API infrastructure for the Legash platform.

---


# Legash Project Team

The Legash project was developed by a team of engineers working across backend, web frontend, mobile, and cloud infrastructure.

| Team Member | CTC ID | Role | Main Contribution |
|---|---|---|---|
| Firaol Abera | CTC-777-26 | Full-Stack & Cloud Gateways Lead | Led full-stack architecture, notification pipelines, email and push notifications, media integration, event publishing, and Docker infrastructure. |
| Estifanos | CTC-1038-26 | Backend Core & Clinical Business Logic | Worked on blood compatibility matching, the 90-day donation eligibility rule, donor Short IDs, hospital intake, donation records, and automated testing. |
| Eyerusalem Gebrat | CTC-4210-26 | Backend Core & Inter-Facility Logistics | Worked on blood center requisition workflows, donation record APIs, modular backend routing, hospital stock analytics, and blood center onboarding. |
| Hanan Seid Mohammed | CTC-3381-26 | Web Frontend Lead & Design Systems | Led the React and TypeScript frontend architecture, dashboard design, localization, hospital records, donor intake, and role-based access control. |
| Enkumariam Dejene Tegen | CTC-551-26 | Web Applications Engineer | Worked on hospital registration, onboarding, blood stock management, blood requisitions, facility profiles, and frontend layout components. |
| Firaol Tsegaye | CTC-7007-26 | Mobile Subsystem Engineer | Worked on Flutter donor onboarding, profile Short ID display, event feed and event details, media playback, and network error handling. |
| Falmi Abdi | CTC-927-26 | Mobile Subsystem Engineer | Worked on Afaan Oromoo localization, nearby blood center discovery, distance calculations, donor statistics, and notification center functionality. |

---

## Project Submission

The following materials provide the project documentation, presentation, and demonstration.

| Submission Material | Link |
|---|---|
| 5-Minute Video Presentation | [Watch Video Presentation](https://www.awesomescreenshot.com/video/58110191?key=7341965dd94802f257e42297911a68dd) |
| Project Documentation (PDF) | [View Project PDF](https://drive.google.com/file/d/1UQ9ReVdnV4jWBQgBATKns4FrPhaQ2jI6/view?usp=sharing) |
| Presentation Slides (PPT) | [View Presentation Slides](PPT_URL) |

---

### Main Features

- **Donor Registration and Management:** Provides a registration and profile management system for blood donors. Donors can maintain their personal information, blood group, and relevant details, while the system keeps track of their donation history and eligibility status.

- **Blood Requests and Intelligent Donor Matching:** Enables hospitals to create blood requests based on their requirements. The system identifies potential donors by considering ABO/Rh blood group compatibility, donor eligibility, and geographical proximity. It also applies a 90-day donation eligibility rule to prevent recently donated donors from being included in new matching processes.

- **Hospital Blood Stock Management:** Allows hospitals to manage and monitor their blood inventory across the eight ABO/Rh blood groups. It supports stock updates, blood requisition management, and analytics that help hospitals understand their blood availability.

- **Blood Center Coordination and Inter-Facility Requisitions:** Connects hospitals with nearby blood centers through a coordinated requisition workflow. Hospitals can identify nearby centers, submit blood requests, and coordinate the transfer of blood supplies between facilities.

- **Notifications and Communication:** Keeps users informed about important activities through notification services, including email and push notifications. These notifications support communication around blood requests, donor matching, account-related activities, and other relevant system events.

- **Blood Donation Campaigns and Events:** Supports the management and publishing of blood donation campaigns and events, helping users discover donation opportunities and stay informed about organized activities.

- **Blood Center Posts and Community Updates:** Provides a way for verified blood centers to publish updates and information that can be shared with donors through the platform.

- **Analytics and Reporting:** Provides hospital blood stock analytics and historical snapshots to help monitor inventory levels, understand stock trends, and support better coordination of blood resources.

- **Web and Mobile Accessibility:** Offers a web application for administrative and hospital workflows, alongside a Flutter-based mobile application that provides donor-focused functionality such as onboarding, profiles, nearby blood center discovery, events, and notifications.

### Project Goal

The overall goal of Legash is to make blood donation and distribution more organized, accessible, and efficient by bringing donors, hospitals, and blood centers into one connected system. Through donor matching, inventory management, inter-facility coordination, and timely notifications, Legash aims to support better access to blood resources and improve coordination among the stakeholders involved in saving lives.

---

## Tech Stack

- **Node.js** — JavaScript runtime
- **Express.js** — Backend framework
- **MongoDB** — NoSQL database
- **Mongoose** — Database modeling and management
- **JWT** — Authentication and authorization
- **Swagger / OpenAPI** — API documentation
- **Jest** — Unit and integration testing
- **Docker** — Application containerization
- **Firebase Cloud Messaging (FCM)** — Push notification integration
- **Brevo** — Transactional email services
- **Cloudinary** — Media storage and CDN integration

---

## Engineering Team & Responsibilities

The backend is developed through collaboration between three engineers, with responsibilities covering full-stack architecture and cloud integrations, core clinical business logic, and inter-facility blood logistics.

### Backend Team
### 1. Firaol Abera

<text weight="medium" color="secondary" size="sm">Full-Stack & Cloud Gateways Lead</text>

**Institutional ID:** CTC-777-26

**Primary Responsibilities:**

- **Full-Stack Architecture:** Leads the design and coordination of the platform architecture, ensuring that backend services, frontend applications, and mobile integrations communicate reliably.
- **Notification Infrastructure:** Designs and manages notification pipelines for transactional email and Firebase Cloud Messaging (FCM) push notifications.
- **Brevo Email Integration:** Implements Brevo transactional email services for application communication, including automated email delivery and notification-related workflows.
- **Firebase Cloud Messaging:** Handles server-side FCM integration and push notification dispatch services to support real-time communication with mobile users.
- **Cloudinary Media Integration:** Manages Cloudinary integration for media uploads, storage, and CDN delivery, particularly for event posters and other application media.
- **Community Feed & Event Publishing:** Develops and maintains backend functionality for community feeds and event publishing, including the supporting media workflows.
- **Hardware Integration:** Handles physical SM-A165F hardware validation and testing to verify application functionality and integration behavior on actual devices.
- **Docker & Containerization:** Manages Docker-based backend containerization and supports deployment configuration to ensure consistent application environments.

### 2. Estifanos

<text weight="medium" color="secondary" size="sm">Backend Core & Clinical Business Logic Engineer</text>

**Institutional ID:** CTC-1038-26

**Primary Responsibilities:**

- **Donation Cooldown State Machine:** Implements the 90-day biological donation lock state machine, ensuring donors cannot make new eligible donation requests during the required recovery period.
- **Blood Compatibility Algorithm:** Develops and maintains the ABO/Rh blood compatibility matching algorithm used to determine compatible donors and recipients across the supported blood groups.
- **Donor Short ID Generation:** Implements cryptographic donor Short ID generation to provide unique donor identifiers for identification and application workflows.
- **Hospital Intake & Donation Recording:** Develops the hospital intake process and donation outcome recording logic, ensuring successful donations are properly recorded and reflected in donor history.
- **Inventory Safety Thresholds:** Implements blood inventory safety thresholds and related stock evaluation logic to support accurate blood availability monitoring.
- **Backend Testing:** Develops and maintains Jest automated tests for core business logic, validating critical donation, compatibility, inventory, and hospital workflows.
- **Clinical Business Rules:** Ensures that donation-related operations follow the defined platform rules, including donor eligibility, donation status transitions, and accurate donation record management.

### 3. Eyerusalem Gebrat

<text weight="medium" color="secondary" size="sm">Backend Core & Inter-Facility Logistics Engineer</text>

**Institutional ID:** CTC-4210-26

**Primary Responsibilities:**

- **Inter-Facility Blood Requisition:** Develops backend workflows that allow hospitals and blood centers to request and coordinate blood supplies between facilities.
- **Cold-Chain Transfer Workflow:** Implements the logic supporting blood transfer coordination and cold-chain logistics between healthcare facilities.
- **Clinical Donation Record Lifecycle:** Develops and maintains the clinical DonationRecord lifecycle, handling donation record creation, updates, and the relationship between donation outcomes and donor medical history.
- **Donation Intake APIs:** Implements and maintains APIs responsible for hospital donation intake and the submission and management of donation information.
- **Dynamic v2Loader Modular Routing:** Develops dynamic modular routing architecture using the v2Loader approach to organize and load backend routes in a scalable and maintainable way.
- **Automated Daily StockSnapshot:** Implements automated daily StockSnapshot generation to preserve inventory snapshots and support historical stock tracking.
- **Stock Analytics:** Develops backend analytics functionality for blood inventory and stock monitoring, providing data required for administrative dashboards and inventory analysis.
- **Blood Center Onboarding:** Implements backend workflows supporting blood center onboarding, registration, and integration into the platform.
- **Backend Integration:** Ensures that the inter-facility logistics, donation records, inventory, and onboarding modules integrate correctly with the existing backend architecture.


## Getting Started

### Prerequisites

- Node.js (v20 or later recommended)
- MongoDB (local instance or MongoDB Atlas)
- npm
- Git

### Installation

Clone the repository and install dependencies:

```bash
git clone <backend-repository-url>
cd Backend
npm install
```

### Environment Configuration

Create a `.env` file in the root directory using `.env.example` as a template.

Configure the required environment variables according to the integrations enabled in the project:

```env
PORT=3000
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret_key
JWT_EXPIRES_IN=1d

# Email Configuration
EMAIL_USER=your_email
EMAIL_APP_PASSWORD=your_email_app_password
EMAIL_FROM=your_email

# Cloudinary Configuration
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

Additional environment variables may be required for Firebase, Brevo, and other configured services. Refer to `.env.example` for the complete configuration.

**Never commit private credentials or the `.env` file.**

### Running the Application

Seed the Super Admin account:

```bash
npm run seed:superadmin
```

Start the development server:

```bash
npm run dev
```

The backend API will be available at:

`http://localhost:3000`

## API Documentation

The project provides interactive API documentation through Swagger.

When the server is running:

- **Swagger UI:** [http://localhost:3000/api-docs](http://localhost:3000/api-docs)
- **OpenAPI Specification:** [http://localhost:3000/openapi.json](http://localhost:3000/openapi.json)

## Testing

The backend includes automated testing for application functionality and API contract validation.

Run the Jest test suite:

```bash
npm test
```

Run API contract validation:

```bash
npm run test:contract
```

Additional available scripts:

```bash
npm run test:newman
npm run lint
```

## Docker

Build the Docker image:

```bash
docker build -t legash-backend .
```

Run the container:

```bash
docker run -p 3000:3000 --env-file .env legash-backend
```

## GitHub Actions — CI/CD

The repository includes a GitHub Actions workflow configured to automate backend verification on supported pushes and pull requests.

The CI workflow includes:

1. Installing project dependencies.
2. Provisioning a MongoDB service for testing.
3. Validating API contract consistency.
4. Running automated backend unit and integration tests.

---
