import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { $ } from "bun";

const SETTINGS_DIR = path.join(
	process.env.HOME || process.env.USERPROFILE || "~",
	".ccumd",
);
const SETTINGS_FILE = path.join(SETTINGS_DIR, "settings.json");

interface Settings {
	devices: string[];
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

export function addDevice(device: string): void {
	const settings = loadSettings();
	if (settings.devices.includes(device)) {
		throw new Error(`Device '${device}' already exists`);
	}
	settings.devices.push(device);
	saveSettings(settings);

	const deviceDir = path.join(SETTINGS_DIR, "devices", device, "projects");
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

	const localDeviceDir = path.join(SETTINGS_DIR, "devices", device, "projects");
	mkdirSync(localDeviceDir, { recursive: true });

	try {
		// First, get all JSONL files with their paths
		const files =
			await $`ssh ${device} "find ~/.claude/projects -name '*.jsonl' 2>/dev/null || true"`.text();

		if (files.trim()) {
			for (const file of files.split("\n").filter(Boolean)) {
				// Extract relative path from the full path
				const relativePath = file.replace(/^.*\/\.claude\/projects\//, "");
				const relativeDir = path.dirname(relativePath);

				// Create local directory structure
				if (relativeDir !== ".") {
					const localSubdir = path.join(localDeviceDir, relativeDir);
					mkdirSync(localSubdir, { recursive: true });
				}

				// Copy the file
				const localFilePath = path.join(localDeviceDir, relativePath);
				await $`scp ${device}:${file} ${localFilePath}`.quiet();
			}
			console.log(
				`Synced ${files.split("\n").filter(Boolean).length} files from device '${device}'`,
			);
		} else {
			console.log(`No JSONL files found on device '${device}'`);
		}
	} catch (error) {
		console.error(`Failed to sync data from device '${device}':`, error);
		throw error;
	}
}
