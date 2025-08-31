import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { $ } from "bun";

const SETTINGS_DIR = path.join(
	process.env.HOME || process.env.USERPROFILE || "~",
	".ccumd",
);
const SETTINGS_FILE = path.join(SETTINGS_DIR, "settings.json");

interface S3Bucket {
	name: string;
	endpoint: string;
	bucket: string;
	accessKeyId: string;
	secretAccessKey: string;
	region?: string;
}

interface Settings {
	devices: string[];
	s3Buckets?: S3Bucket[];
}

function ensureSettingsDir() {
	if (!existsSync(SETTINGS_DIR)) {
		mkdirSync(SETTINGS_DIR, { recursive: true });
	}
}

function loadSettings(): Settings {
	ensureSettingsDir();
	if (!existsSync(SETTINGS_FILE)) {
		const defaultSettings: Settings = { devices: [] };
		Bun.write(SETTINGS_FILE, JSON.stringify(defaultSettings, null, 2));
		return defaultSettings;
	}
	try {
		const text = readFileSync(SETTINGS_FILE, "utf8");
		return JSON.parse(text);
	} catch (error) {
		console.error("Error reading settings file:", error);
		const defaultSettings: Settings = { devices: [] };
		saveSettings(defaultSettings);
		return defaultSettings;
	}
}

function saveSettings(settings: Settings) {
	ensureSettingsDir();
	Bun.write(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

export function listDevices(): string[] {
	const settings = loadSettings();
	return settings.devices;
}

export function getS3Buckets(): S3Bucket[] {
	const settings = loadSettings();
	return settings.s3Buckets || [];
}

export function addS3Bucket(bucket: S3Bucket): void {
	const settings = loadSettings();
	if (!settings.s3Buckets) {
		settings.s3Buckets = [];
	}

	// Check if bucket with same name already exists
	const existingIndex = settings.s3Buckets.findIndex(
		(b) => b.name === bucket.name,
	);
	if (existingIndex !== -1) {
		// Update existing bucket
		settings.s3Buckets[existingIndex] = bucket;
	} else {
		// Add new bucket
		settings.s3Buckets.push(bucket);
	}

	saveSettings(settings);
}

export function deleteS3Bucket(name: string): void {
	const settings = loadSettings();
	if (settings.s3Buckets) {
		settings.s3Buckets = settings.s3Buckets.filter((b) => b.name !== name);
		saveSettings(settings);
	}
}

export function getS3Bucket(name: string): S3Bucket | undefined {
	const settings = loadSettings();
	return settings.s3Buckets?.find((b) => b.name === name);
}

export function addDevice(device: string): void {
	const settings = loadSettings();
	if (settings.devices.includes(device)) {
		throw new Error(`Device '${device}' already exists`);
	}
	settings.devices.push(device);
	saveSettings(settings);

	const deviceDir = path.join(SETTINGS_DIR, "devices", device);
	mkdirSync(deviceDir, { recursive: true });
}

export async function deleteDevice(device: string): Promise<void> {
	const settings = loadSettings();
	const index = settings.devices.indexOf(device);
	if (index === -1) {
		throw new Error(`Device '${device}' not found`);
	}
	settings.devices.splice(index, 1);
	saveSettings(settings);

	const deviceDir = path.join(SETTINGS_DIR, "devices", device);
	if (existsSync(deviceDir)) {
		await $`rm -rf ${deviceDir}`;
	}
}

export async function syncDeviceData(device: string): Promise<void> {
	const settings = loadSettings();
	if (!settings.devices.includes(device)) {
		throw new Error(`Device '${device}' not found`);
	}

	const localDeviceDir = path.join(SETTINGS_DIR, "devices", device);
	mkdirSync(localDeviceDir, { recursive: true });

	const remoteTarFile = `/tmp/claude-projects-${device}-${Date.now()}.tar.gz`;
	const localTarFile = path.join(
		localDeviceDir,
		`claude-projects-${device}.tar.gz`,
	);

	try {
		// Check if ~/.claude/projects exists on remote
		const projectsExists =
			await $`ssh ${device} "test -d ~/.claude/projects && echo 'exists' || echo 'not exists'"`.text();

		if (projectsExists.trim() !== "exists") {
			console.log(
				`No ~/.claude/projects directory found on device '${device}'`,
			);
			// Create empty projects directory locally
			mkdirSync(path.join(localDeviceDir, "projects"), { recursive: true });
			return;
		}

		// Create tar.gz on remote device
		await $`ssh ${device} "cd ~/.claude && tar -czf ${remoteTarFile} projects"`;

		// Transfer tar.gz file
		await $`scp ${device}:${remoteTarFile} ${localTarFile}`;

		// Extract tar.gz locally
		await $`cd ${localDeviceDir} && tar -xzf ${localTarFile}`;

		// Get file count for logging
		const fileCount =
			await $`find ${path.join(localDeviceDir, "projects")} -name "*.jsonl" 2>/dev/null | wc -l`.text();
		console.log(`Synced ${fileCount.trim()} files from device '${device}'`);

		// Clean up tar.gz files
		await $`rm -f ${localTarFile}`;
		await $`ssh ${device} "rm -f ${remoteTarFile}"`;
	} catch (error) {
		// Clean up on error
		try {
			await $`rm -f ${localTarFile}`.quiet();
			await $`ssh ${device} "rm -f ${remoteTarFile}"`.quiet();
		} catch {}

		console.error(`Failed to sync data from device '${device}':`, error);
		throw error;
	}
}
