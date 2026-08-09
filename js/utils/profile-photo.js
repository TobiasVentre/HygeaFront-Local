/**
 * Foto de perfil guardada en el navegador.
 *
 * El backend todavia no tiene donde guardar un avatar, asi que la imagen vive
 * en localStorage de este equipo: no viaja al servidor ni se ve desde otro
 * dispositivo. Cuando exista el endpoint, lo unico que cambia es de donde sale
 * y a donde va el data URL; el resto de la vista no se entera.
 */

const STORAGE_PREFIX = "hygea-profile-photo:";

/** Arriba de esto ni intentamos leer el archivo: seria congelar la pestaña. */
const MAX_SOURCE_BYTES = 8 * 1024 * 1024;

/** Lado del cuadrado final. Alcanza de sobra para un avatar y pesa poco. */
const OUTPUT_SIZE = 256;

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];

function getStorageKey(userId) {
  return `${STORAGE_PREFIX}${userId || "anon"}`;
}

export function getProfilePhoto(userId) {
  try {
    return window.localStorage.getItem(getStorageKey(userId));
  } catch {
    // Modo privado o storage bloqueado: la vista sigue con las iniciales.
    return null;
  }
}

export function saveProfilePhoto(userId, dataUrl) {
  try {
    window.localStorage.setItem(getStorageKey(userId), dataUrl);
    return true;
  } catch {
    throw new Error("No pudimos guardar la foto en este navegador. Puede que no haya espacio disponible.");
  }
}

export function removeProfilePhoto(userId) {
  try {
    window.localStorage.removeItem(getStorageKey(userId));
  } catch {
    // Si no se pudo borrar tampoco se habia podido guardar.
  }
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("No pudimos abrir esa imagen. Proba con otro archivo."));
    image.src = dataUrl;
  });
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("No pudimos leer el archivo."));
    reader.readAsDataURL(file);
  });
}

/**
 * Recorta la imagen al cuadrado central y la reduce a OUTPUT_SIZE. Sin esto una
 * foto de camara de 4 MB entraria entera en localStorage y lo llenaria.
 */
export async function fileToAvatarDataUrl(file) {
  if (!file) throw new Error("Elegi una imagen para subir.");
  if (!ACCEPTED_TYPES.includes(file.type)) {
    throw new Error("El archivo tiene que ser una imagen PNG, JPG o WEBP.");
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error("La imagen pesa mas de 8 MB. Proba con una mas liviana.");
  }

  const sourceDataUrl = await readAsDataUrl(file);
  const image = await loadImage(sourceDataUrl);

  const side = Math.min(image.naturalWidth, image.naturalHeight);
  if (!side) throw new Error("No pudimos abrir esa imagen. Proba con otro archivo.");

  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;

  const context = canvas.getContext("2d");
  // Los PNG con transparencia terminan en JPG: sin este fondo quedan negros.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
  context.drawImage(
    image,
    (image.naturalWidth - side) / 2,
    (image.naturalHeight - side) / 2,
    side,
    side,
    0,
    0,
    OUTPUT_SIZE,
    OUTPUT_SIZE
  );

  return canvas.toDataURL("image/jpeg", 0.82);
}
