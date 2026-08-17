/**
 * Static asset URLs served from /public. The board photo is a FICTIONAL sample board
 * (MG-DEV-01) drawn for the mockups; the isometric bracket is an ILLUSTRATION, not
 * kernel output. Neither implies auto-detection or a validated part.
 */
export const BOARD_PHOTO_SRC = "/board-photo.svg";
export const BRACKET_ISO_SRC = "/bracket-iso.svg";

/** The sample photo's intrinsic coordinate space (the SVG viewBox), used as its px space. */
export const SAMPLE_IMAGE = { widthPx: 1000, heightPx: 660 } as const;
