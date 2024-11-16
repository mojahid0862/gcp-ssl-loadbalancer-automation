const express = require('express');
const bodyParser = require('body-parser');
const { GoogleAuth } = require('google-auth-library');
const { google } = require('googleapis');

const app = express();
app.use(bodyParser.json());

const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform']
});

async function waitForBackendServiceReady(compute, project, backendServiceName, maxRetries = 5, delay = 10000) {
  let backendServiceReady = false;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const backendServiceResponse = await compute.backendServices.get({
        project: project,
        backendService: backendServiceName
      });
      const backendService = backendServiceResponse.data;
      console.log(`Backend service status: ${JSON.stringify(backendService)}`);
      if (backendService && backendService.name) {
        backendServiceReady = true;
        console.log(`Backend service ${backendServiceName} is ready.`);
        break;
      } else {
        console.log(`Backend service ${backendServiceName} is not ready. Waiting...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    } catch (error) {
      console.error(`Error checking backend service readiness: ${error.message}`);
      if (i === maxRetries - 1) {
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  if (!backendServiceReady) {
    throw new Error(`Backend service ${backendServiceName} is not ready after ${maxRetries} attempts.`);
  }
}

async function waitForOperationToComplete(compute, project, operationName, maxRetries = 10, delay = 5000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const operationResponse = await compute.globalOperations.get({
        project: project,
        operation: operationName
      });
      const operation = operationResponse.data;
      console.log(`Operation status: ${JSON.stringify(operation)}`);
      if (operation.status === 'DONE') {
        console.log(`Operation ${operationName} is complete.`);
        if (operation.error) {
          throw new Error(`Operation ${operationName} completed with errors: ${JSON.stringify(operation.error)}`);
        }
        return;
      } else {
        console.log(`Operation ${operationName} is still in progress. Waiting...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    } catch (error) {
      console.error(`Error checking operation status: ${error.message}`);
      if (i === maxRetries - 1) {
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error(`Operation ${operationName} did not complete after ${maxRetries} attempts.`);
}

async function retryOperation(operation, delay, retries) {
  for (let i = 0; i < retries; i++) {
    try {
      return await operation();
    } catch (err) {
      if (i === retries - 1) {
        throw err;
      }
      console.log(`Retrying operation... Attempt ${i + 1}`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

app.post('/generate-cert', async (req, res) => {
  const { domain, loadBalancerName } = req.body;

  if (!domain || !loadBalancerName) {
    return res.status(400).send('Domain and load balancer name are required.');
  }

  try {
    const authClient = await auth.getClient();
    const compute = google.compute({
      version: 'v1',
      auth: authClient
    });

    const project = await auth.getProjectId();

    // Define the resource name
    const certificateName = `cert-${domain.replace(/\./g, '-')}`;

    // Check for existing SSL certificate
    const existingCertsResponse = await compute.sslCertificates.list({ project });
    let certificateSelfLink;
    let existingCert = existingCertsResponse.data.items.find(cert => cert.managed && cert.managed.domains.includes(domain));
    if (existingCert) {
      console.log(`Existing certificate found: ${existingCert.name}`);
      certificateSelfLink = existingCert.selfLink;
    } else {
      // Create the certificate at the global level
      const certResponse = await compute.sslCertificates.insert({
        project: project,
        requestBody: {
          name: certificateName,
          type: 'MANAGED',
          managed: {
            domains: [domain]
          }
        }
      });

      // Wait for the certificate creation operation to complete
      await waitForOperationToComplete(compute, project, certResponse.data.name);

      // Retrieve the created certificate selfLink
      certificateSelfLink = `projects/${project}/global/sslCertificates/${certificateName}`;

      console.log(`New certificate created: ${certificateName}`);
    }

    // Wait for the backend service to be ready
    await waitForBackendServiceReady(compute, project, loadBalancerName);

    // Find the backend service
    const backendServiceList = await compute.backendServices.list({ project });
    const backendService = backendServiceList.data.items.find(service => service.name === loadBalancerName);

    if (!backendService) {
      return res.status(404).send('Load balancer not found.');
    }

    console.log(`Backend service ${backendService.name} found. Checking SSL certificates...`);

    // Check if the backend service already has the SSL certificate
    if (backendService.sslCertificates && backendService.sslCertificates.includes(certificateSelfLink)) {
      console.log(`Backend service already has the SSL certificate: ${certificateName}`);
    } else {
      // Update the backend service to use the new SSL certificate with retry mechanism
      const patchResponse = await retryOperation(async () => {
        console.log(`Patching backend service with new SSL certificate: ${certificateName}`);
        const response = await compute.backendServices.patch({
          project: project,
          backendService: backendService.name,
          requestBody: {
            name: backendService.name,
            sslCertificates: backendService.sslCertificates ? [...backendService.sslCertificates, certificateSelfLink] : [certificateSelfLink]
          }
        });
        console.log(`Patch response: ${JSON.stringify(response.data)}`);
        return response.data;
      }, 5000, 5); // Retry 5 times with a 5-second delay

      // Wait for the patch operation to complete
      await waitForOperationToComplete(compute, project, patchResponse.name);
    }

    // Find the URL map associated with the backend service
    const urlMapList = await compute.urlMaps.list({ project });
    const urlMap = urlMapList.data.items.find(map => map.defaultService === backendService.selfLink);

    if (!urlMap) {
      return res.status(404).send('URL map not found.');
    }

    console.log(`URL map ${urlMap.name} found. Checking host rules...`);

    // Check if the domain is already in the host rules
    let hostRuleUpdated = false;
    urlMap.hostRules.forEach(hostRule => {
      if (!hostRule.hosts.includes(domain)) {
        hostRule.hosts.push(domain);
        hostRuleUpdated = true;
      }
    });

    let patchUrlMapResponse;
    if (hostRuleUpdated) {
      console.log(`Updating URL map ${urlMap.name} with new domain...`);
      patchUrlMapResponse = await compute.urlMaps.patch({
        project: project,
        urlMap: urlMap.name,
        requestBody: {
          hostRules: urlMap.hostRules,
          pathMatchers: urlMap.pathMatchers
        }
      });
      console.log(`URL map updated: ${patchUrlMapResponse.data.name}`);
    } else {
      console.log(`URL map ${urlMap.name} already includes the domain.`);
    }

    // Find the target HTTPS proxy associated with the URL map
    const targetHttpsProxyList = await compute.targetHttpsProxies.list({ project });
    const targetHttpsProxy = targetHttpsProxyList.data.items.find(proxy => proxy.urlMap === urlMap.selfLink);

    if (!targetHttpsProxy) {
      return res.status(404).send('Target HTTPS proxy not found.');
    }

    console.log(`Target HTTPS proxy ${targetHttpsProxy.name} found. Checking SSL certificates...`);

    // Check if the proxy already has the SSL certificate
    if (targetHttpsProxy.sslCertificates && targetHttpsProxy.sslCertificates.includes(certificateSelfLink)) {
      console.log(`Target HTTPS proxy already has the SSL certificate: ${certificateName}`);
    } else {
      // Retrieve the existing proxy configuration to get the fingerprint
      const proxyGetResponse = await compute.targetHttpsProxies.get({
        project: project,
        targetHttpsProxy: targetHttpsProxy.name
      });

      const proxyFingerprint = proxyGetResponse.data.fingerprint;

      // Update the target HTTPS proxy to include the new SSL certificate
      const proxyPatchResponse = await retryOperation(async () => {
        console.log(`Patching target HTTPS proxy with new SSL certificate: ${certificateName}`);
        const response = await compute.targetHttpsProxies.patch({
          project: project,
          targetHttpsProxy: targetHttpsProxy.name,
          requestBody: {
            sslCertificates: targetHttpsProxy.sslCertificates ? [...targetHttpsProxy.sslCertificates, certificateSelfLink] : [certificateSelfLink],
            fingerprint: proxyFingerprint
          }
        });
        console.log(`Proxy patch response: ${JSON.stringify(response.data)}`);
        return response.data;
      }, 5000, 5); // Retry 5 times with a 5-second delay

      // Wait for the proxy patch operation to complete
      await waitForOperationToComplete(compute, project, proxyPatchResponse.name);
    }

    console.log('Domain configured successfully.');

    res.status(200).send({
      message: 'Domain configured successfully',
      // certificateResponse: existingCert || certResponse.data,
      // urlMapResponse: hostRuleUpdated ? patchUrlMapResponse.data : urlMap,
      // proxyResponse: targetHttpsProxy
    });
  } catch (error) {
    console.error(`Error: ${error.message}`);
    res.status(500).send('Error creating SSL certificate and updating load balancer.');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});




/*

{
  "domain": "yourdomaon.com",
  "loadBalancerName": "your_load_bilancer_name"
}
  
*/