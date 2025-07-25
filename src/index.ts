import { $ } from "bun";
import { homedir } from "node:os";
import path from "node:path";
import { calculateTotals } from "ccusage/calculate-cost";
import { loadDailyUsageData } from "ccusage/data-loader";
import { handleDeviceCommand } from "./cli";
import { listDevices, syncDeviceData } from "./lib/device";

const args = process.argv.slice(2);

if (args[0] === "device") {
	await handleDeviceCommand(args.slice(1));
} else {
	const devices = listDevices();
	const paths = [`${homedir()}/.claude`];

	if (devices.length > 0) {
		console.log("Syncing device data...");
		for (const device of devices) {
			try {
				await syncDeviceData(device);
				const devicePath = path.join(homedir(), ".ccumd", "devices", device);
				paths.push(devicePath);
				console.log(`✓ Synced ${device}`);
			} catch (error) {
				console.error(`✗ Failed to sync ${device}: ${error}`);
			}
		}
		console.log();
	}

	const claudePath = paths.join(",");
	await $`bunx ccusage`.env({
		CLAUDE_CONFIG_DIR: claudePath,
		FORCE_COLOR: "1",
	});
}
