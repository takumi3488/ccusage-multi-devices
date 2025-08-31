import {
	addDevice,
	addS3Bucket,
	deleteDevice,
	deleteS3Bucket,
	getS3Buckets,
	listDevices,
	syncDeviceData,
} from "./lib/device";
import { type S3Config, testS3Connection } from "./lib/s3";

export async function handleDeviceCommand(args: string[]) {
	const subcommand = args[0];

	switch (subcommand) {
		case undefined: {
			const devices = listDevices();
			if (devices.length === 0) {
				console.log("No devices registered.");
			} else {
				console.log("Registered devices:");
				for (const device of devices) {
					console.log(`  - ${device}`);
				}
			}
			break;
		}

		case "add": {
			const deviceToAdd = args[1];
			if (!deviceToAdd) {
				console.error("Error: Device name is required");
				console.error("Usage: ccumd device add <device>");
				process.exit(1);
			}
			try {
				addDevice(deviceToAdd);
				console.log(`Device '${deviceToAdd}' added successfully.`);
				console.log("Syncing device data...");
				await syncDeviceData(deviceToAdd);
				console.log("Device data synced successfully.");
			} catch (error) {
				console.error(`Error: ${error}`);
				process.exit(1);
			}
			break;
		}

		case "delete": {
			const deviceToDelete = args[1];
			if (!deviceToDelete) {
				console.error("Error: Device name is required");
				console.error("Usage: ccumd device delete <device>");
				process.exit(1);
			}
			try {
				await deleteDevice(deviceToDelete);
				console.log(`Device '${deviceToDelete}' deleted successfully.`);
			} catch (error) {
				console.error(`Error: ${error}`);
				process.exit(1);
			}
			break;
		}

		default:
			console.error(`Unknown device subcommand: ${subcommand}`);
			console.error("Available commands: add, delete");
			process.exit(1);
	}
}

export async function handleS3Command(args: string[]) {
	const subcommand = args[0];

	switch (subcommand) {
		case undefined:
		case "list": {
			const buckets = getS3Buckets();
			if (buckets.length === 0) {
				console.log("No S3 buckets configured.");
				console.log("Run 'ccumd s3 add' to add an S3 bucket.");
			} else {
				console.log("Configured S3 buckets:");
				for (const bucket of buckets) {
					console.log(`  - ${bucket.name}`);
					console.log(`    Endpoint: ${bucket.endpoint}`);
					console.log(`    Bucket: ${bucket.bucket}`);
					if (bucket.region) console.log(`    Region: ${bucket.region}`);
				}
			}
			break;
		}

		case "add": {
			// Parse arguments
			if (args.length < 6) {
				console.error("Error: Missing required arguments");
				console.error(
					"Usage: ccumd s3 add <name> <endpoint> <bucket> <access_key_id> <secret_access_key> [--region <region>]",
				);
				console.error("\nExample:");
				console.error(
					"  ccumd s3 add my-s3 https://s3.amazonaws.com my-bucket AKIAIOSFODNN7EXAMPLE wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
				);
				console.error(
					"  ccumd s3 add cloudflare https://accountid.r2.cloudflarestorage.com my-bucket key secret",
				);
				process.exit(1);
			}

			const name = args[1];
			const endpoint = args[2];
			const bucket = args[3];
			const accessKeyId = args[4];
			const secretAccessKey = args[5];

			// Validate required arguments
			if (!name || !endpoint || !bucket || !accessKeyId || !secretAccessKey) {
				console.error("Error: All required arguments must be provided");
				process.exit(1);
			}

			// Parse optional region flag
			let region: string | undefined;
			for (let i = 6; i < args.length; i++) {
				if (args[i] === "--region" && i + 1 < args.length) {
					region = args[++i];
				}
			}

			// Validate endpoint URL
			if (!endpoint) {
				console.error("Error: Endpoint is required");
				process.exit(1);
			}
			try {
				new URL(endpoint);
			} catch {
				console.error("Error: Invalid endpoint URL");
				process.exit(1);
			}

			const s3Config: S3Config = {
				name,
				endpoint,
				bucket,
				accessKeyId,
				secretAccessKey,
				region,
			};

			// Test connection before saving
			console.log("Testing S3 connection...");
			const isConnected = await testS3Connection(s3Config);
			if (!isConnected) {
				console.error(
					"Failed to connect to S3. Please check your credentials and bucket configuration.",
				);
				process.exit(1);
			}

			addS3Bucket(s3Config);
			console.log(`S3 bucket '${name}' added successfully.`);
			console.log(`Endpoint: ${endpoint}`);
			console.log(`Bucket: ${bucket}`);
			if (region) console.log(`Region: ${region}`);
			break;
		}

		case "delete": {
			const nameToDelete = args[1];
			if (!nameToDelete) {
				console.error("Error: Bucket name is required");
				console.error("Usage: ccumd s3 delete <name>");
				process.exit(1);
			}

			deleteS3Bucket(nameToDelete);
			console.log(`S3 bucket '${nameToDelete}' deleted successfully.`);
			break;
		}

		default:
			console.error(`Unknown s3 subcommand: ${subcommand}`);
			console.error("Available commands: list, add, delete");
			process.exit(1);
	}
}
