
import { auth } from "../src/lib/auth.ts";

console.log("Auth keys:");
console.log(JSON.stringify(Object.keys(auth), null, 2));
