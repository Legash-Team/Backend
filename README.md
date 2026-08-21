# Legash Backend API

Legash is a Smart Blood Donation Management System designed to streamline blood requests, hospital validations, compatible donor matching, and campaign management.

---

## Getting Started

### Prerequisites
*   Node.js (v20+ recommended)
*   MongoDB (Local instance or Docker container)

### Environment Configuration
Create a `.env` file in the root of the Backend/ directory (use `.env.example` as a template):
```env
PORT=3000
MONGO_URI=mongodb://localhost:27017/legash
JWT_SECRET=your_jwt_secret_key
JWT_EXPIRES_IN=1d

# Email SMTP (for notifications & OTP)
EMAIL_USER=your_email@gmail.com
EMAIL_APP_PASSWORD=your_gmail_app_password
EMAIL_FROM=your_email@gmail.com

# Cloudinary (for event media uploads)
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

### Installation & Seed Setup
1. Install dependencies:
   ```bash
   npm install
   ```
2. Seed the Super Admin account (for administrative actions):
   ```bash
   npm run seed:superadmin
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```

---

## API & Interactive Documentation

When the server is running, you can access:
*   Swagger Interactive Docs: http://localhost:3000/api-docs
*   Raw OpenAPI Specification: http://localhost:3000/openapi.json

---

## Testing Suites

This repository includes Jest integration/unit tests and API contract validation tools.

*   Run Jest Test Suite:
    ```bash
    npm test
    ```
*   Run API Contract Checks:
    ```bash
    npm run test:contract
    ```

---

## Running with Docker

### Build the Image
To build the optimized production image:
```bash
docker build -t legash-backend .
```

### Run the Container
Run the container and link it to your local network/MongoDB instance:
```bash
docker run -p 3000:3000 --env-file .env legash-backend
```

---

## GitHub Actions CI/CD
This project is configured with a GitHub Actions workflow (`.github/workflows/ci.yml`) triggering on pushes and pull requests to the `main` branch. It automatically:
1. Provisions a MongoDB service container.
2. Performs Node package installation.
3. Runs contract drift validation.
4. Executes the full integration/unit Jest test suites.

---

## Contributors

- Firaol
- Estifanos
- Eyerusalem