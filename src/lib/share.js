// Sharing a backup through the phone's share sheet (Drive, iCloud, mail…).
// Chrome on Android only shares some file types (images, audio, video, PDF,
// plain text): a .json file is refused, so we fall back to the same content
// as a .txt file. Import accepts both.

/** A File the share sheet accepts, or null when this browser can't share files. */
export function shareableFile(text, fileName, nav = typeof navigator === "undefined" ? undefined : navigator) {
  if (!nav?.canShare) return null;
  const candidates = [[fileName, "application/json"], [fileName.replace(/\.json$/i, ".txt"), "text/plain"]];
  for (const [name, type] of candidates) {
    try {
      const file = new File([text], name, { type });
      if (nav.canShare({ files: [file] })) return file;
    } catch { /* try the next format */ }
  }
  return null;
}

/** What the file pickers accept: backups saved as .json or, after sharing on Android, as .txt. */
export const BACKUP_ACCEPT = "application/json,.json,text/plain,.txt";
