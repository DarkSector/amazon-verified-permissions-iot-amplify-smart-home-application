/**
 * @type {import('@types/aws-lambda').APIGatewayProxyHandler}
 */

import * as jwt from 'jsonwebtoken';
import {IoTDataPlaneClient, UpdateThingShadowCommand, GetThingShadowCommand} from "@aws-sdk/client-iot-data-plane";
import * as permissions from '/opt/nodejs/permissions.mjs';  // This comes from custom code in the layer

const REGION = 'us-east-1';
const client = new IoTDataPlaneClient({region: REGION});

// this function gets data from device shadow using the deviceId
async function setTemperature(deviceId, temperature, mode, power) {
    console.log("setTemperature");
    // update device shadow
    const shadowUpdate = {
        state: {
            desired: {
                temperature,
                mode,
                power
            }
        }
    };
    const payload = new TextEncoder().encode(JSON.stringify(shadowUpdate));
    const command = new UpdateThingShadowCommand({        
        thingName: deviceId,
        payload: payload
    });
    try {
        const response = await client.send(command);
        const updatedShadow = JSON.parse(new TextDecoder().decode(response.payload));
        console.log(updatedShadow);
    } catch (error) {
        console.error("Error updating shadow:", error);
    }
};

async function getTemperature(thingName) {
    // Initialize the AWS IoT Data Plane client
    const iotData = new IoTDataPlaneClient({
      region: REGION,  // Replace with your AWS region
    });

    const command = new GetThingShadowCommand({
      thingName: thingName,
    });

    try {
      const data = await iotData.send(command);

      // The shadow payload is a Uint8Array, so we need to convert it to a string
      // and then parse it as JSON to get a JavaScript object.
      const payload = JSON.parse(new TextDecoder("utf-8").decode(data.payload));
      return {reportedTemperature: payload.state.reported.temperature};
    } catch (error) {
      console.error(`Failed to retrieve shadow for ${thingName}:`, error);
      return null;
    }
  }

  export const handler = async (event) => {
    console.log(`EVENT: ${JSON.stringify(event)}`);

    // get bearer token from event headers
    const token = event.headers.Authorization.split(' ')[1];
    console.log(`TOKEN: ${token}`);
    // decode jwt
    const decoded = jwt.decode(token, {complete: true});
    console.log(`DECODED: ${JSON.stringify(decoded)}`);
    // get deviceId from path parameters
    const deviceId = event.pathParameters.deviceId;
    // get action and other parameters from post body
    const { action, temperature, deviceMode, power, globalTime } = JSON.parse(event.body);
    console.log(`ACTION: ${JSON.stringify(action)}`);
    console.log(deviceId);

    let shadow = {
        deviceId: deviceId,
        state: {
            desired: {
                temperature: temperature,
                mode: deviceMode,
                power: power,
                time: globalTime
            }
        }
    };

    const evaluation = await permissions.permissionsCheck(decoded.payload.username, action, shadow);
    console.log(`Decision: ${evaluation}`);

    let payload;
    if (evaluation.decision != "ALLOW") {
        return {
            statusCode: 403,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "*"
            },
            body: JSON.stringify({
                payload: 'Amazon verified permission unauthorized!',
                evaluation
            }),
        };
    }

    
    if (action === 'SetTemperature') {
        payload = setTemperature(deviceId, temperature, deviceMode, power);
    } else if (action === 'GetTemperature') {
        payload = await getTemperature(deviceId);
    } else {
        return {
            statusCode: 400,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "*"
            },
            body: JSON.stringify('Invalid action!'),
        };
    }

    return {
        statusCode: 200,
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "*"
        },
        body: JSON.stringify({
            payload,
            evaluation
        }),
    };
};
