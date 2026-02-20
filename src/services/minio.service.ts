import { Client, type ItemBucketMetadata } from "minio";
import fs from "node:fs";
import path from "node:path";
import env from "env-var";

// Parse S3_ENDPOINT URL (e.g. "http://localhost:9000")
const s3Url = new URL(env.get("S3_ENDPOINT").required().asString());

export abstract class MinioService {
	private static client: Client = new Client({
		endPoint: s3Url.hostname,
		port: Number(s3Url.port) || (s3Url.protocol === "https:" ? 443 : 9000),
		useSSL: s3Url.protocol === "https:",
		accessKey: env.get("S3_ACCESS_KEY").required().asString(),
		secretKey: env.get("S3_SECRET_KEY").required().asString(),
	});

	private static bucketName: string = env
		.get("S3_BUCKET")
		.required()
		.asString();

	private static generateUniqueFileNameWithTimestamp(
		originalName: string,
	): string {
		const timestamp = new Date().toISOString().replace(/[:.-]/g, "");
		const [name, extension] = originalName
			.replace(/\s+/g, "_")
			.split(/\.(?=[^.]+$)/);
		return `${name}_${timestamp}.${extension}`;
	}

	public static async ensureBucket(): Promise<void> {
		const exists = await MinioService.client.bucketExists(
			MinioService.bucketName,
		);

		if (!exists) {
			await MinioService.client.makeBucket(
				MinioService.bucketName,
				MinioService.client.region,
			);
		}
	}

	public static async listBucket() {
		return await MinioService.client.listBuckets();
	}

	async uploadFileGeneral(
		file: File,
		objectName: string,
		jenis_file: string,
		contentType?: string,
	): Promise<string> {
		const uploadDir = "./uploads";
		if (!fs.existsSync(uploadDir)) {
			fs.mkdirSync(uploadDir, { recursive: true });
		}

		const nameReplace =
			MinioService.generateUniqueFileNameWithTimestamp(objectName);

		const tempFilePath = path.join(uploadDir, file.name);
		const fileBuffer = Buffer.from(await file.arrayBuffer());
		fs.writeFileSync(tempFilePath, fileBuffer);

		let folderBucket = jenis_file || "";
		if (jenis_file === "lampiran") {
			folderBucket = "lampiran/";
		} else if (jenis_file === "signature") {
			folderBucket = "signature/";
		} else {
			folderBucket = "";
		}

		await MinioService.client.fPutObject(
			MinioService.bucketName,
			folderBucket + nameReplace,
			tempFilePath,
			{ "Content-Type": contentType || "application/octet-stream" },
		);

		fs.unlinkSync(tempFilePath);

		const url = await MinioService.client.presignedUrl(
			"GET",
			MinioService.bucketName,
			folderBucket + nameReplace,
			7 * 24 * 60 * 60,
		);

		return url;
	}

	public static async uploadFile(
		file: File,
		category_file: string,
		contentType?: string,
	): Promise<{ url: string; nameReplace: string }> {
		try {
			// Buat upload directory
			const uploadDir = "./uploads";

			if (!fs.existsSync(uploadDir)) {
				fs.mkdirSync(uploadDir, { recursive: true });
			}

			const nameReplace = MinioService.generateUniqueFileNameWithTimestamp(
				file.name,
			);

			// Simpan file ke lokal
			const tempFilePath = path.join(uploadDir, file.name);

			const fileBuffer = Buffer.from(await file.arrayBuffer());

			fs.writeFileSync(tempFilePath, fileBuffer);

			// Upload ke MinIO

			await MinioService.client.fPutObject(
				MinioService.bucketName,
				category_file + nameReplace,
				tempFilePath,
				{ "Content-Type": contentType || "application/octet-stream" },
			);

			// Hapus file temp
			fs.unlinkSync(tempFilePath);

			// Generate presigned URL
			const url = await MinioService.client.presignedUrl(
				"GET",
				MinioService.bucketName,
				category_file + nameReplace,
				7 * 24 * 60 * 60,
			);

			return { url, nameReplace };
		} catch (error) {
			console.error(" MINIO ERROR:");
			if (error instanceof Error) {
				console.error("Error message:", error.message);
				console.error("Error stack:", error.stack);
				throw new Error(`Minio upload failed: ${error.message}`);
			} else {
				console.error("Unknown error:", error);
				throw new Error(`Minio upload failed: ${String(error)}`);
			}
		}
	}

	public static async downloadFile(
		objectName: string,
		downloadPath: string,
	): Promise<void> {
		await MinioService.client.fGetObject(
			MinioService.bucketName,
			objectName,
			downloadPath,
		);
	}

	public static async getPresignedUrl(
		jenis_file: string,
		objectName: string,
		expirySeconds: number,
	): Promise<string> {
		let folderBucket = "";
		if (jenis_file === "lampiran") {
			folderBucket = "lampiran/";
		} else if (jenis_file === "signature") {
			folderBucket = "signature/";
		} else {
			folderBucket = "";
		}

		const url = await MinioService.client.presignedUrl(
			"GET",
			MinioService.bucketName,
			folderBucket + objectName,
			expirySeconds,
		);
		return url;
	}

	public static async listObjects(prefix = ""): Promise<string[]> {
		return new Promise((resolve, reject) => {
			const objects: string[] = [];
			const stream = MinioService.client.listObjects(
				MinioService.bucketName,
				prefix,
				true,
			);

			stream.on("data", (obj: ItemBucketMetadata) => {
				objects.push(obj.name);
			});

			stream.on("end", () => resolve(objects));
			stream.on("error", (err: any) => reject(err));
		});
	}

	public static async deleteFile(jenis_file: string, objectName: string) {
		let folderBucket = "";
		if (jenis_file === "lampiran") {
			folderBucket = "lampiran/";
		} else if (jenis_file === "signature") {
			folderBucket = "signature/";
		} else {
			folderBucket = "";
		}

		const result = await MinioService.client.removeObject(
			MinioService.bucketName,
			folderBucket + objectName,
		);
		return result;
	}

	public static async getFileStream(location: string) {
		// Get file stat to get metadata (content type, size, etc.)
		const stat = await MinioService.client.statObject(
			MinioService.bucketName,
			location,
		);

		// Get stream
		const stream = await MinioService.client.getObject(
			MinioService.bucketName,
			location,
		);

		return { stat, stream };
	}
}

await MinioService.ensureBucket();
