import { initializeApp } from "firebase-admin/app";

initializeApp();

export { setUserRole } from "./admin/setUserRole";
export { deleteUserData } from "./admin/deleteUserData";
export { generateReflection } from "./ai/generateReflection";
