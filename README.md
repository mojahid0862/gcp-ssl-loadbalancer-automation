# Automated SSL Certificate Deployment and Load Balancer Configuration on GCP

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node.js Version](https://img.shields.io/badge/node-%3E%3D12.0.0-brightgreen.svg)
![GCP](https://img.shields.io/badge/GCP-Compute%20Engine-orange.svg)

## Table of Contents

- [Automated SSL Certificate Deployment and Load Balancer Configuration on GCP](#automated-ssl-certificate-deployment-and-load-balancer-configuration-on-gcp)
  - [Table of Contents](#table-of-contents)
  - [Introduction](#introduction)
  - [Features](#features)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Configuration](#configuration)
    - [Google Cloud Authentication](#google-cloud-authentication)
    - [Required Permissions](#required-permissions)
  - [Running the Script](#running-the-script)
  - [API Endpoint](#api-endpoint)
    - [`POST /generate-cert`](#post-generate-cert)
      - [Request Body Parameters](#request-body-parameters)
      - [Example Request Body](#example-request-body)
  - [Example Request](#example-request)
      - [Expected Response](#expected-response)
  - [Error Handling](#error-handling)
  - [License](#license)
  - [Contributing](#contributing)
  - [Contact](#contact)

## Introduction

This Node.js application automates the process of creating managed SSL certificates and updating load balancer configurations on Google Cloud Platform (GCP). It streamlines the deployment of SSL certificates, updates backend services, URL maps, and target HTTPS proxies, reducing manual effort and the risk of misconfigurations.

## Features

- **Automated SSL Certificate Creation:** Checks for existing certificates and creates new ones if necessary.
- **Backend Service Integration:** Updates backend services to include the SSL certificate.
- **URL Map Update:** Adds domains to URL map host rules.
- **HTTPS Proxy Configuration:** Updates target HTTPS proxies with the new SSL certificate.
- **Robust Error Handling:** Implements retries and operation status checks for reliability.

## Prerequisites

- **Node.js** version 12 or higher
- **Google Cloud SDK** installed and configured
- A **GCP Project** with the necessary permissions:
  - Compute Engine API enabled
  - Permissions to manage SSL certificates, backend services, URL maps, and target HTTPS proxies
- **Service Account JSON Key** (if not using default credentials)

## Installation

1. **Clone the Repository**

   ```bash
   git clone git@github.com:mojahid0862/gcp-ssl-loadbalancer-automation.git
   cd gcp-ssl-lb-automation
   ```

2. **Install Dependencies**

   ```bash
   npm install
   ```

3. **Set Up Environment Variables**

   Create a `.env` file in the root directory (optional if using default credentials).

   ```env
   GOOGLE_APPLICATION_CREDENTIALS=/path/to/your/service-account-key.json
   PORT=3000
   ```

## Configuration

### Google Cloud Authentication

The script uses the Google Cloud Client Library for authentication. You can authenticate using one of the following methods:

- **Default Credentials**: If you're running the script on a GCP Compute Engine instance or have `gcloud` configured locally.
- **Service Account Key**: Set the `GOOGLE_APPLICATION_CREDENTIALS` environment variable to the path of your service account JSON key.

### Required Permissions

Ensure that the authenticated account has the following permissions:

- `compute.sslCertificates.create`
- `compute.backendServices.update`
- `compute.urlMaps.update`
- `compute.targetHttpsProxies.update`

## Running the Script

Start the Express server:

```bash
npm start
```

The server will start on the port specified in the `PORT` environment variable (default is `3000`).

## API Endpoint

### `POST /generate-cert`

Automates the creation of an SSL certificate and updates the load balancer configuration.

#### Request Body Parameters

- `domain` (string, required): The domain for which to create the SSL certificate.
- `loadBalancerName` (string, required): The name of the backend service (load balancer) to update.

#### Example Request Body

```json
{
  "domain": "example.yourdomain.com",
  "loadBalancerName": "your-backend-service-name"
}
```

## Example Request

You can use `curl` or any API client like Postman to make a request:

```bash
curl -X POST http://localhost:3000/generate-cert \
  -H 'Content-Type: application/json' \
  -d '{
        "domain": "example.yourdomain.com",
        "loadBalancerName": "your-backend-service-name"
      }'
```

#### Expected Response

```json
{
  "message": "Domain configured successfully"
}
```

## Error Handling

The script includes robust error handling and will return appropriate HTTP status codes and messages:

- `400 Bad Request`: Missing `domain` or `loadBalancerName` in the request body.
- `404 Not Found`: Specified load balancer, URL map, or target HTTPS proxy not found.
- `500 Internal Server Error`: General errors during the SSL certificate creation or load balancer update process.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## Contact

For questions or collaboration, feel free to reach out:

- **Email**: i@mojahidhidulhaque.in
- **LinkedIn**: [MOjahid_Ul Haque](https://www.linkedin.com/in/mojahid-ul-haque/)

---

*Disclaimer: This script modifies resources in your Google Cloud project. Please ensure you have proper backups and understand the changes being made before running in a production environment.*