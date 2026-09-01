import { initializeApp } from "firebase-admin/app";

initializeApp();

export { setUserRole } from "./admin/setUserRole";
export { deleteUserData } from "./admin/deleteUserData";
export { saveAiConfig } from "./admin/saveAiConfig";
export { generateReflection } from "./ai/generateReflection";
export { testAiConnection } from "./ai/testConnection";
export { sendChatMessage } from "./ai/sendChatMessage";
export { askWebAppHelp } from "./ai/askWebAppHelp";
export { onCrisisAlertCreated } from "./email/onCrisisAlertCreated";
