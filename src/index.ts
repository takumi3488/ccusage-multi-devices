import { loadDailyUsageData } from "ccusage/data-loader";
import { handleDeviceCommand } from "./cli";

const args = process.argv.slice(2);

if (args[0] === "device") {
	await handleDeviceCommand(args.slice(1));
} else {
	const dailyData = await loadDailyUsageData();
	console.log("Daily Usage Data:", dailyData);
}
