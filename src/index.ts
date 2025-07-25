import { homedir } from "node:os";
import path from "node:path";
import { $ } from "bun";
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

	// Check if --graph flag is present
	const graphIndex = args.indexOf("--graph");
	if (graphIndex !== -1) {
		// Remove --graph from args for ccusage command
		const ccusageArgs = args.filter((_, index) => index !== graphIndex);
		const subcommands = ccusageArgs.length > 0 ? ccusageArgs : ["daily"];

		// Get cost data with --json flag
		console.log(`Running: bunx ccusage ${subcommands.join(" ")} --json`);
		console.log(`CLAUDE_CONFIG_DIR: ${claudePath}`);

		const result = await $`bunx ccusage ${subcommands} --json`
			.env({
				CLAUDE_CONFIG_DIR: claudePath,
				FORCE_COLOR: "1",
			})
			.text();

		console.log("Raw ccusage output:", result);

		const costData = JSON.parse(result);
		console.log("Parsed cost data:", JSON.stringify(costData, null, 2));

		// Start web server with chart
		const server = Bun.serve({
			port: 3004,
			fetch(req) {
				const url = new URL(req.url);

				if (url.pathname === "/") {
					return new Response(getChartHTML(costData), {
						headers: { "Content-Type": "text/html" },
					});
				}

				if (url.pathname === "/data") {
					return new Response(JSON.stringify(costData), {
						headers: { "Content-Type": "application/json" },
					});
				}

				return new Response("Not Found", { status: 404 });
			},
		});

		console.log(`Chart server running at http://localhost:3004`);

		// Open browser
		await $`open http://localhost:3004`;

		// Keep server running
		process.on("SIGINT", () => {
			server.stop();
			process.exit(0);
		});

		// Keep the process alive
		await new Promise(() => {});
	} else {
		const subcommands = args.length > 0 ? args.slice(0) : "daily";
		await $`bunx ccusage ${subcommands}`.env({
			CLAUDE_CONFIG_DIR: claudePath,
			FORCE_COLOR: "1",
		});
	}
}

function getChartHTML(costData: object): string {
	return `<!DOCTYPE html>
<html>
<head>
    <title>Claude Cost Usage Chart</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .container { max-width: 1200px; margin: 0 auto; }
        .chart-container { position: relative; height: 400px; margin: 20px 0; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Claude Cost Usage</h1>
        <div class="chart-container">
            <canvas id="costChart"></canvas>
        </div>
    </div>
    
    <script>
        const costData = ${JSON.stringify(costData)};
        
        // Extract dates and totals for the chart
        const labels = [];
        const totals = [];
        
        console.log('Processing cost data for chart:', costData);
        
        if (costData.daily && Array.isArray(costData.daily)) {
            // Daily data array
            console.log('Found daily array:', costData.daily);
            for (const dayData of costData.daily) {
                labels.push(dayData.date);
                totals.push(dayData.totalCost || 0);
                console.log(\`Added data point: \${dayData.date} = \${dayData.totalCost || 0}\`);
            }
        } else if (costData.usage_by_date) {
            // Daily/monthly data object
            console.log('Found usage_by_date:', costData.usage_by_date);
            for (const [date, data] of Object.entries(costData.usage_by_date)) {
                labels.push(date);
                totals.push(data.total_cost || 0);
                console.log(\`Added data point: \${date} = \${data.total_cost || 0}\`);
            }
        } else if (costData.totals && costData.totals.totalCost !== undefined) {
            // Single total from totals object
            console.log('Found totals.totalCost:', costData.totals.totalCost);
            labels.push('Total');
            totals.push(costData.totals.totalCost);
        } else {
            console.log('No recognizable data structure found in costData');
        }
        
        console.log('Final chart data - labels:', labels, 'totals:', totals);
        
        const ctx = document.getElementById('costChart').getContext('2d');
        new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Cost ($)',
                    data: totals,
                    borderColor: 'rgb(75, 192, 192)',
                    backgroundColor: 'rgba(75, 192, 192, 0.2)',
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return '$' + value.toFixed(4);
                            }
                        }
                    }
                },
                plugins: {
                    title: {
                        display: true,
                        text: 'Claude Usage Cost Over Time'
                    }
                }
            }
        });
    </script>
</body>
</html>`;
}
