import type { ScoreSheetOcrProvider } from "./score-sheet-ocr";

export const MAX_SCORE_SHEET_PAGES = 8;
export const MAX_SCORE_SHEET_FILE_BYTES = 12 * 1024 * 1024;
export const MAX_SCORE_SHEET_ROWS = 80;

export type ScoreSheetPageInput = {
  file: File;
  page: number;
  rotation: 0 | 90 | 180 | 270;
};

export type PreparedScoreSheetRow = {
  id: string;
  page: number;
  row: number;
  cropUrl: string;
  hypotheses: string[];
};

function canvasFromBitmap(bitmap: ImageBitmap, rotation: number): HTMLCanvasElement {
  const scale = Math.min(1, 2200 / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  const swap = rotation === 90 || rotation === 270;
  canvas.width = swap ? height : width;
  canvas.height = swap ? width : height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Das Formularbild konnte nicht vorbereitet werden.");
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate((rotation * Math.PI) / 180);
  context.drawImage(bitmap, -width / 2, -height / 2, width, height);
  return canvas;
}

function createCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

async function correctPerspectiveAndLighting(input: HTMLCanvasElement): Promise<HTMLCanvasElement> {
  const { loadOpenCv } = await import("./opencv-loader");
  const cv = await loadOpenCv();
  const source = cv.imread(input);
  const gray = new cv.Mat();
  const blurred = new cv.Mat();
  const edges = new cv.Mat();
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  const warped = new cv.Mat();
  const threshold = new cv.Mat();
  const ink = new cv.Mat();
  const horizontalLines = new cv.Mat();
  const verticalLines = new cv.Mat();
  const cleanInk = new cv.Mat();
  const horizontalKernel = cv.getStructuringElement(
    cv.MORPH_RECT,
    new cv.Size(Math.max(25, Math.floor(source.cols * 0.1)), 1),
  );
  const verticalKernel = cv.getStructuringElement(
    cv.MORPH_RECT,
    new cv.Size(1, Math.max(25, Math.floor(source.rows * 0.1))),
  );
  try {
    cv.cvtColor(source, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
    cv.Canny(blurred, edges, 50, 150);
    cv.findContours(edges, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

    const candidates = Array.from({ length: contours.size() }, (_, index) => contours.get(index))
      .sort((a, b) => cv.contourArea(b) - cv.contourArea(a));
    let corners: Array<{ x: number; y: number }> | null = null;
    for (const contour of candidates.slice(0, 12)) {
      const perimeter = cv.arcLength(contour, true);
      const polygon = new cv.Mat();
      cv.approxPolyDP(contour, polygon, perimeter * 0.02, true);
      if (polygon.rows === 4 && cv.isContourConvex(polygon)) {
        const points = Array.from({ length: 4 }, (_, index) => ({
          x: polygon.data32S[index * 2],
          y: polygon.data32S[index * 2 + 1],
        }));
        const area = cv.contourArea(polygon);
        if (area > source.cols * source.rows * 0.15) corners = orderCorners(points);
      }
      polygon.delete();
      if (corners) break;
    }
    for (const contour of candidates) contour.delete();

    let document = source;
    if (corners) {
      const [topLeft, topRight, bottomRight, bottomLeft] = corners;
      const width = Math.round(Math.max(distance(topLeft, topRight), distance(bottomLeft, bottomRight)));
      const height = Math.round(Math.max(distance(topLeft, bottomLeft), distance(topRight, bottomRight)));
      if (width > 100 && height > 100) {
        const sourcePoints = cv.matFromArray(4, 1, cv.CV_32FC2, corners.flatMap(({ x, y }) => [x, y]));
        const targetPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, width, 0, width, height, 0, height]);
        const homography = cv.getPerspectiveTransform(sourcePoints, targetPoints);
        cv.warpPerspective(source, warped, homography, new cv.Size(width, height), cv.INTER_CUBIC, cv.BORDER_REPLICATE);
        sourcePoints.delete();
        targetPoints.delete();
        homography.delete();
        document = warped;
      }
    }

    const documentGray = new cv.Mat();
    try {
      cv.cvtColor(document, documentGray, cv.COLOR_RGBA2GRAY);
      cv.adaptiveThreshold(
        documentGray,
        threshold,
        255,
        cv.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv.THRESH_BINARY,
        31,
        12,
      );
      cv.bitwise_not(threshold, ink);
      cv.morphologyEx(ink, horizontalLines, cv.MORPH_OPEN, horizontalKernel);
      cv.morphologyEx(ink, verticalLines, cv.MORPH_OPEN, verticalKernel);
      cv.subtract(ink, horizontalLines, cleanInk);
      cv.subtract(cleanInk, verticalLines, cleanInk);
      cv.bitwise_not(cleanInk, threshold);
      const output = createCanvas(threshold.cols, threshold.rows);
      cv.imshow(output, threshold);
      return output;
    } finally {
      documentGray.delete();
    }
  } finally {
    source.delete();
    gray.delete();
    blurred.delete();
    edges.delete();
    contours.delete();
    hierarchy.delete();
    warped.delete();
    threshold.delete();
    ink.delete();
    horizontalLines.delete();
    verticalLines.delete();
    cleanInk.delete();
    horizontalKernel.delete();
    verticalKernel.delete();
  }
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function orderCorners(points: Array<{ x: number; y: number }>) {
  const bySum = [...points].sort((a, b) => a.x + a.y - b.x - b.y);
  const topLeft = bySum[0];
  const bottomRight = bySum[3];
  const byDifference = [...points].sort((a, b) => a.y - a.x - (b.y - b.x));
  return [topLeft, byDifference[0], bottomRight, byDifference[3]];
}

export function detectPeriodicTextRows(
  projection: readonly number[],
  width: number,
  height: number,
): Array<{ top: number; bottom: number }> | null {
  const minimumActivity = Math.max(8, Math.floor(width * 0.002));
  const activeRows = projection.flatMap((value, y) => value >= minimumActivity ? [y] : []);
  if (activeRows.length < 4) return null;

  let regionTop = activeRows[0];
  let regionBottom = Math.min(height, activeRows.at(-1)! + 1);
  let activeRegionTop = activeRows[0];
  let activeRegionBottom = activeRows[0];
  let longestRegionTop = activeRows[0];
  let longestRegionBottom = activeRows[0];
  for (const y of activeRows.slice(1)) {
    if (y - activeRegionBottom > 18) {
      if (activeRegionBottom - activeRegionTop > longestRegionBottom - longestRegionTop) {
        longestRegionTop = activeRegionTop;
        longestRegionBottom = activeRegionBottom;
      }
      activeRegionTop = y;
    }
    activeRegionBottom = y;
  }
  if (activeRegionBottom - activeRegionTop > longestRegionBottom - longestRegionTop) {
    longestRegionTop = activeRegionTop;
    longestRegionBottom = activeRegionBottom;
  }
  if (longestRegionBottom - longestRegionTop >= 160) {
    regionTop = longestRegionTop;
    regionBottom = Math.min(height, longestRegionBottom + 1);
  }
  if (regionBottom - regionTop < 160) return null;

  const smoothed = projection.map((_, y) => {
    let total = 0;
    let count = 0;
    for (let offset = -2; offset <= 2; offset += 1) {
      const value = projection[y + offset];
      if (value !== undefined) {
        total += value;
        count += 1;
      }
    }
    return total / count;
  });
  const regionMean = smoothed.slice(regionTop, regionBottom)
    .reduce((total, value) => total + value, 0) / (regionBottom - regionTop);
  const centered = smoothed.map((value) => value - regionMean);
  let pitch = 0;
  let bestCorrelation = 0;
  const maxPitch = Math.min(160, Math.floor((regionBottom - regionTop) / 4));

  for (let candidate = 32; candidate <= maxPitch; candidate += 1) {
    let covariance = 0;
    let firstVariance = 0;
    let secondVariance = 0;
    for (let y = regionTop; y + candidate < regionBottom; y += 1) {
      const first = centered[y];
      const second = centered[y + candidate];
      covariance += first * second;
      firstVariance += first * first;
      secondVariance += second * second;
    }
    const correlation = covariance / Math.sqrt(firstVariance * secondVariance);
    if (correlation > bestCorrelation) {
      pitch = candidate;
      bestCorrelation = correlation;
    }
  }
  if (pitch === 0 || bestCorrelation < 0.4) return null;

  const searchRadius = Math.max(3, Math.floor(pitch * 0.28));
  let phase = regionTop;
  let bestPhaseScore = -1;
  for (let candidate = regionTop; candidate < regionTop + pitch; candidate += 1) {
    let score = 0;
    for (let center = candidate; center < regionBottom; center += pitch) {
      for (let y = Math.max(regionTop, center - searchRadius); y <= Math.min(regionBottom - 1, center + searchRadius); y += 1) {
        score += smoothed[y];
      }
    }
    if (score > bestPhaseScore) {
      phase = candidate;
      bestPhaseScore = score;
    }
  }

  const peakThreshold = Math.max(8, Math.floor(width * 0.006));
  const rows: Array<{ top: number; bottom: number }> = [];
  const peakSearch = Math.max(2, Math.floor(pitch * 0.12));
  for (let center = phase; center < regionBottom; center += pitch) {
    let peak = center;
    for (let y = Math.max(regionTop, center - peakSearch); y <= Math.min(regionBottom - 1, center + peakSearch); y += 1) {
      if (projection[y] > projection[peak]) peak = y;
    }
    if (projection[peak] < peakThreshold) continue;
    rows.push({
      top: Math.max(regionTop, Math.floor(peak - pitch * 0.42)),
      bottom: Math.min(regionBottom, Math.ceil(peak + pitch * 0.42)),
    });
  }
  return rows.length >= 3 ? rows : null;
}

function detectTextRows(canvas: HTMLCanvasElement): Array<{ top: number; bottom: number }> {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Das Formular konnte nicht auf Textzeilen untersucht werden.");
  const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
  const projection: number[] = [];
  const active: number[] = [];
  const threshold = Math.max(8, Math.floor(width * 0.002));
  for (let y = 0; y < height; y += 1) {
    let darkPixels = 0;
    for (let x = 0; x < width; x += 2) {
      const offset = (y * width + x) * 4;
      if (data[offset] < 155) darkPixels += 1;
    }
    projection.push(darkPixels);
    if (darkPixels >= threshold) active.push(y);
  }

  const periodicRows = detectPeriodicTextRows(projection, width, height);
  if (periodicRows) return periodicRows;

  const rows: Array<{ top: number; bottom: number }> = [];
  for (const y of active) {
    const current = rows.at(-1);
    if (current && y - current.bottom <= 18) current.bottom = y;
    else rows.push({ top: y, bottom: y });
  }
  return rows
    .filter((row) => row.bottom - row.top >= 5)
    .map((row) => ({
      top: Math.max(0, row.top - 8),
      bottom: Math.min(height, row.bottom + 9),
    }));
}

function rowToCanvas(source: HTMLCanvasElement, top: number, bottom: number) {
  const crop = createCanvas(source.width, Math.max(1, bottom - top));
  const context = crop.getContext("2d");
  if (!context) throw new Error("Ein Formularausschnitt konnte nicht vorbereitet werden.");
  context.drawImage(source, 0, top, source.width, bottom - top, 0, 0, crop.width, crop.height);
  return crop;
}

function splitTextCells(row: HTMLCanvasElement): HTMLCanvasElement[] {
  const context = row.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Die Formularzeile konnte nicht segmentiert werden.");
  const { data, width, height } = context.getImageData(0, 0, row.width, row.height);
  const activeColumns: number[] = [];
  const minimumInk = Math.max(2, Math.floor(height * 0.025));
  for (let x = 0; x < width; x += 1) {
    let darkPixels = 0;
    for (let y = 0; y < height; y += 1) {
      if (data[(y * width + x) * 4] < 155) darkPixels += 1;
    }
    if (darkPixels >= minimumInk) activeColumns.push(x);
  }

  const gapThreshold = Math.max(9, Math.floor(height * 0.2));
  const spans: Array<{ left: number; right: number }> = [];
  for (const x of activeColumns) {
    const current = spans.at(-1);
    if (current && x - current.right <= gapThreshold) current.right = x;
    else spans.push({ left: x, right: x });
  }
  const cells = spans.filter((span) => span.right - span.left >= 4);
  if (cells.length <= 1) return [row];

  return cells.map((span) => {
    const left = Math.max(0, span.left - 10);
    const right = Math.min(width, span.right + 11);
    const crop = createCanvas(right - left, height);
    const cropContext = crop.getContext("2d");
    if (!cropContext) throw new Error("Ein Schachzug konnte nicht ausgeschnitten werden.");
    cropContext.drawImage(row, left, 0, right - left, height, 0, 0, crop.width, crop.height);
    return crop;
  });
}

async function canvasToJpegUrl(canvas: HTMLCanvasElement) {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Ein Zeilenausschnitt konnte nicht erzeugt werden.")), "image/jpeg", 0.85);
  });
  return URL.createObjectURL(blob);
}

export async function recognizeScoreSheetPages(
  pages: readonly ScoreSheetPageInput[],
  provider: ScoreSheetOcrProvider,
  onProgress: (completed: number, total: number) => void,
) {
  const rows: PreparedScoreSheetRow[] = [];
  const totalPages = pages.length;
  let globalRow = 0;

  try {
    for (const page of pages) {
      if (!page.file.type.startsWith("image/") || page.file.size > MAX_SCORE_SHEET_FILE_BYTES) {
        throw new Error("Bitte wähle Bilddateien bis maximal 12 MB pro Seite.");
      }
      const bitmap = await createImageBitmap(page.file, { imageOrientation: "from-image" });
      try {
        const oriented = canvasFromBitmap(bitmap, page.rotation);
        const processed = await correctPerspectiveAndLighting(oriented);
        let spans = detectTextRows(processed);
        if (!spans.length) spans = [{ top: 0, bottom: processed.height }];
        for (let row = 0; row < spans.length; row += 1) {
          globalRow += 1;
          if (globalRow > MAX_SCORE_SHEET_ROWS) {
            throw new Error(`Es wurden mehr als ${MAX_SCORE_SHEET_ROWS} Zeilen gefunden. Bitte verarbeite weniger Seiten auf einmal.`);
          }
          const crop = rowToCanvas(processed, spans[row].top, spans[row].bottom);
          const cropUrl = await canvasToJpegUrl(crop);
          try {
            const cells = splitTextCells(crop);
            const cellHypotheses: string[][] = [];
            for (const cell of cells) {
              const predictions = await provider.recognize(cell);
              cellHypotheses.push(predictions.map((hypothesis) => hypothesis.text));
            }
            const hypothesisCount = Math.max(0, ...cellHypotheses.map((hypotheses) => hypotheses.length));
            const hypotheses = Array.from({ length: hypothesisCount }, (_, index) =>
              cellHypotheses.map((predictions) => predictions[index] ?? predictions[0] ?? "").join(" ").trim(),
            ).filter(Boolean);
            rows.push({
              id: `${page.page}-${row + 1}`,
              page: page.page,
              row: row + 1,
              cropUrl,
              hypotheses,
            });
          } catch (error) {
            URL.revokeObjectURL(cropUrl);
            throw error;
          }
          onProgress(page.page, totalPages);
        }
      } finally {
        bitmap.close();
      }
    }
  } catch (error) {
    rows.forEach((row) => URL.revokeObjectURL(row.cropUrl));
    throw error;
  }
  return rows;
}
