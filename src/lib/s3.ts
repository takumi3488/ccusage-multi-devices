import { mkdirSync } from "node:fs";
import path from "node:path";
import { S3 } from "@aws-sdk/client-s3";
import { $ } from "bun";

const SETTINGS_DIR = path.join(
	process.env.HOME || process.env.USERPROFILE || "~",
	".ccumd",
);

export interface S3Config {
	name: string;
	endpoint: string;
	bucket: string;
	accessKeyId: string;
	secretAccessKey: string;
	region?: string;
}

interface S3Object {
	key: string;
	size: number;
	lastModified: Date;
}

function createS3Client(config: S3Config): S3 {
	// Parse endpoint URL to get the base URL without protocol
	const _endpointUrl = new URL(config.endpoint);

	return new S3({
		endpoint: config.endpoint,
		region: config.region || "auto",
		credentials: {
			accessKeyId: config.accessKeyId,
			secretAccessKey: config.secretAccessKey,
		},
		forcePathStyle: true, // Required for S3-compatible services
	});
}

export async function listS3Objects(config: S3Config): Promise<S3Object[]> {
	try {
		const client = createS3Client(config);

		// List all objects with claude_projects prefix
		const response = await client.listObjectsV2({
			Bucket: config.bucket,
			Prefix: "claude_projects",
		});

		if (!response.Contents) {
			return [];
		}

		return response.Contents.map((obj) => ({
			key: obj.Key || "",
			size: obj.Size || 0,
			lastModified: obj.LastModified || new Date(),
		}));
	} catch (error) {
		console.error(`Failed to list S3 objects: ${error}`);
		return [];
	}
}

export async function downloadS3Object(
	config: S3Config,
	key: string,
	localPath: string,
): Promise<void> {
	const client = createS3Client(config);

	const response = await client.getObject({
		Bucket: config.bucket,
		Key: key,
	});

	if (response.Body) {
		const arrayBuffer = await response.Body.transformToByteArray();
		await Bun.write(localPath, arrayBuffer);
	}
}

export async function syncS3Data(config: S3Config): Promise<void> {
	const s3Dir = path.join(SETTINGS_DIR, "s3", config.name);
	mkdirSync(s3Dir, { recursive: true });

	console.log(`Syncing S3 bucket: ${config.bucket} (${config.name})`);

	// List all relevant objects
	const objects = await listS3Objects(config);

	if (objects.length === 0) {
		console.log("No Claude projects found in S3 bucket");
		return;
	}

	console.log(`Found ${objects.length} Claude project archives in S3`);

	// Download and extract each archive
	for (const obj of objects) {
		const tempFile = path.join(s3Dir, `temp_${Date.now()}.tar.gz`);

		try {
			// Download the tar.gz file
			await downloadS3Object(config, obj.key, tempFile);

			// Extract to s3 directory (creates projects subdirectory)
			await $`cd ${s3Dir} && tar -xzf ${tempFile}`;

			// Clean up temp file
			await $`rm -f ${tempFile}`;

			console.log(
				`✓ Synced ${obj.key} (${(obj.size / 1024 / 1024).toFixed(2)} MB)`,
			);
		} catch (error) {
			console.error(`Failed to sync ${obj.key}: ${error}`);
			// Clean up on error
			try {
				await $`rm -f ${tempFile}`.quiet();
			} catch {}
		}
	}

	// Get total file count
	const fileCount =
		await $`find ${path.join(s3Dir, "projects")} -name "*.jsonl" 2>/dev/null | wc -l`.text();
	console.log(`Total: ${fileCount.trim()} files synced from S3`);
}

export async function testS3Connection(config: S3Config): Promise<boolean> {
	try {
		const client = createS3Client(config);
		await client.headBucket({ Bucket: config.bucket });
		return true;
	} catch (error) {
		console.error(`Failed to connect to S3: ${error}`);
		return false;
	}
}
