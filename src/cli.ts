import {
	addDevice,
	deleteDevice,
	listDevices,
	syncDeviceData,
} from "./lib/device";

export async function handleDeviceCommand(args: string[]) {
	const subcommand = args[0];

	switch (subcommand) {
		case undefined: {
			const devices = listDevices();
			if (devices.length === 0) {
				console.log("No devices registered.");
			} else {
				console.log("Registered devices:");
				devices.forEach((device) => console.log(`  - ${device}`));
			}
			break;
		}

		case "add": {
			const deviceToAdd = args[1];
			if (!deviceToAdd) {
				console.error("Error: Device name is required");
				console.error("Usage: bunx ccumd device add <device>");
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
				console.error("Usage: bunx ccumd device delete <device>");
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
