/**
 * Wire protocol constants.
 * Bump PROTOCOL_VERSION when a schema field is added/removed/renamed.
 * Client must refuse rooms that advertise a different major version.
 */

/** Semver-ish: major = breaking schema, minor = additive, patch = docs/fix. */
export const PROTOCOL_VERSION = "0.3.2";

/** Colyseus room name for the open-world zone (Phase 1). */
export const ROOM_NAME_ZONE = "zone";

/** Default zone instance id until multi-zone ships. */
export const DEFAULT_ZONE_ID = "snowfield-north";
