import { config } from "./config.ts";
import { Prisma } from "@backend/db/index.ts";
import { app } from "./server.ts";
import { LetterInstanceService } from "@backend/services/database_models/letterInstance.service.ts";

const signals = ["SIGINT", "SIGTERM"];

for (const signal of signals) {
	process.on(signal, async () => {
		console.log(`Received ${signal}. Initiating graceful shutdown...`);
		await app.stop();
		process.exit(0);
	});
}

process.on("uncaughtException", (error) => {
	console.error(error);
});

process.on("unhandledRejection", (error) => {
	console.error(error);
});

await Prisma.$connect();
console.log("Database was connected!");

// Auto-backfill templateConfig for letters created before template versioning
LetterInstanceService.backfillAllTemplateConfigs()
	.then((count) => {
		if (count > 0) console.log(`Backfilled templateConfig for ${count} existing letter(s)`);
	})
	.catch((err) => console.error("Template backfill failed (non-fatal):", err));

app.listen(config.PORT, () =>
	console.log(`Server started at ${app.server?.url.origin}`),
);
