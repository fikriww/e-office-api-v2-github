import env from "env-var";

export const config = {
	NODE_ENV: env
		.get("NODE_ENV")
		.default("development")
		.asEnum(["production", "test", "development"]),

	PORT: env.get("PORT").default(3000).asPortNumber(),
	API_URL: env
		.get("API_URL")
		.default(`https://${env.get("PUBLIC_DOMAIN").asString()}`)
		.asString(),
	DATABASE_URL: env.get("DATABASE_URL").required().asString(),
	LOCK_STORE: env.get("LOCK_STORE").default("memory").asEnum(["memory"]),

	// SSO
	SSO_HOST: env.get("SSO_HOST").default("https://apps-fsm.undip.ac.id/sso_api").asString(),
	FRONTEND_URL: env.get("FRONTEND_URL").default("http://10.137.58.124:20021").asString(),

	// SMTP settings
	SMTP_HOST: env.get("SMTP_HOST").default("smtp.gmail.com").asString(),
	SMTP_PORT: env.get("SMTP_PORT").default(587).asPortNumber(),
	SMTP_SECURE: env.get("SMTP_SECURE").default("false").asBool(),
	SMTP_USER: env.get("SMTP_USER").default("eofficefsm@gmail.com").asString(),
	SMTP_PASS: env.get("SMTP_PASS").default("").asString(),
	SMTP_FROM: env.get("SMTP_FROM").default("E-Office FSM <eofficefsm@gmail.com>").asString(),
};
