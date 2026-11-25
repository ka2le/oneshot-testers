import { publish } from "./deploy.mjs";
try {
  console.log(await publish());
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
