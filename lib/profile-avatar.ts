const PUBLIC_AVATAR_PATH = "/storage/v1/object/public/profile-avatars/";

export function getProfileAvatarSrc(userId: string, avatarUrl: string | null | undefined) {
  if (!avatarUrl) return null;
  if (avatarUrl.startsWith(`${userId}/`)) {
    return `/api/profile-avatar?userId=${encodeURIComponent(userId)}`;
  }

  try {
    const url = new URL(avatarUrl);
    const markerIndex = url.pathname.indexOf(PUBLIC_AVATAR_PATH);
    if (markerIndex >= 0) {
      return `/api/profile-avatar?userId=${encodeURIComponent(userId)}`;
    }
    return url.protocol === "https:" ? avatarUrl : null;
  } catch {
    return null;
  }
}
