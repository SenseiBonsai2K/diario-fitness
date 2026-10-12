// Sharing a backup through the phone's share sheet (Drive, iCloud, mail…).
// Chrome on Android only shares some file types (images, audio, video, PDF,
// plain text) and may say yes to a .json file in canShare() and then refuse it
// in share(). So outside iPhone/iPad the backup is shared as .txt (same JSON
// content); restore accepts both.

export const isIos = (nav = typeof navigator === "undefined" ? undefined : navigator) =>
  !!nav && (/iPhone|iPad|iPod/.test(nav.userAgent || "") || (nav.platform === "MacIntel" && nav.maxTouchPoints > 1));

/** A File the share sheet accepts, or null when this browser can't share files. */
export function shareableFile(text, fileName, nav = typeof navigator === "undefined" ? undefined : navigator) {
  if (!nav?.canShare) return null;
  const json = [fileName, "application/json"];
  const txt = [fileName.replace(/\.json$/i, ".txt"), "text/plain"];
  for (const [name, type] of isIos(nav) ? [json, txt] : [txt, json]) {
    try {
      const file = new File([text], name, { type });
      if (nav.canShare({ files: [file] })) return file;
    } catch { /* try the next format */ }
  }
  return null;
}

/** What the file pickers accept: backups saved as .json or, after sharing on Android, as .txt. */
export const BACKUP_ACCEPT = "application/json,.json,text/plain,.txt";
