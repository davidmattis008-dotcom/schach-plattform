import cvModule from "@techstark/opencv-js";

export async function loadOpenCv() {
  if (cvModule instanceof Promise) return cvModule;
  if (cvModule.Mat) return cvModule;
  await new Promise<void>((resolve) => {
    cvModule.onRuntimeInitialized = () => resolve();
  });
  return cvModule;
}
