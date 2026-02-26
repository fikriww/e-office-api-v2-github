// pegawai.service.ts

import { Prisma, type Pegawai } from "@backend/db/index.ts";
import type {
	PegawaiDelegate,
	PegawaiInclude,
	PegawaiUncheckedCreateInput,
	PegawaiUncheckedUpdateInput,
} from "@backend/generated/prisma/models.ts";
import { CRUD } from "./__basicCRUD.ts";

export abstract class PegawaiService extends CRUD<
	Pegawai,
	PegawaiDelegate,
	PegawaiInclude
>(Prisma.pegawai) {
	public static create(data: PegawaiUncheckedCreateInput) {
		return Prisma.pegawai.create({
			data: data,
		});
	}

	public static update(id: string, data: PegawaiUncheckedUpdateInput) {
		return Prisma.pegawai.update({
			where: { id: id },
			data: data,
		});
	}
}
