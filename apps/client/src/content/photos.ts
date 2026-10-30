/**
 * Photographies du fond défilant (fondues dans la scène, sans cadre, en noir et blanc).
 * Source actuelle : images de la NASA (usage libre, crédits dans assets/chronique/credits.json et docs/CREDITS.md).
 * Pour en ajouter : déposer le fichier dans assets/chronique/ et déclarer une entrée ci-dessous.
 * N'utiliser que des images libres de droits ou vos propres images.
 */
export const PHOTOS: { src: number; year: string; label: string }[] = [
  { src: require("../../assets/chronique/nasa-9905998.jpg"), year: "1999", label: "STATION SPATIALE INTERNATIONALE" },
  { src: require("../../assets/chronique/nasa-iss070e062746.jpg"), year: "2024", label: "LA TERRE DE NUIT, VUE DE L'ORBITE" },
  { src: require("../../assets/chronique/nasa-s36-39-014.jpg"), year: "1990", label: "NEW YORK DE NUIT · MISSION STS-36" },
  { src: require("../../assets/chronique/nasa-200623_ISS_1.jpg"), year: "2020", label: "L'ORBITE, NOUVEL ESPACE STRATÉGIQUE" },
];
