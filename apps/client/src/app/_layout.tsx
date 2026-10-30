import { useEffect } from "react";
import { DarkTheme, Stack, ThemeProvider } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import { CormorantGaramond_400Regular, CormorantGaramond_500Medium_Italic, CormorantGaramond_600SemiBold } from "@expo-google-fonts/cormorant-garamond";
import { IBMPlexSans_400Regular, IBMPlexSans_500Medium, IBMPlexSans_600SemiBold } from "@expo-google-fonts/ibm-plex-sans";
import { IBMPlexMono_400Regular, IBMPlexMono_600SemiBold } from "@expo-google-fonts/ibm-plex-mono";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Pressable, Text, View } from "react-native";
import type { ErrorBoundaryProps } from "expo-router";
import { AuthProvider, useAuth } from "../lib/auth";
import { Chronicle, ChronicleVeil } from "../components/Chronicle";
import { Wordmark } from "../components/Brand";
import { C, F } from "../theme";

/** Barrière d'erreur globale : jamais d'écran vide ; la session reprend après « Réessayer ». */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <View style={{ flex: 1, backgroundColor: C.bg, alignItems: "center", justifyContent: "center", padding: 32, gap: 16 }}>
      <Text style={{ fontFamily: F.monoBold, color: C.red, letterSpacing: 3, fontSize: 12 }}>INCIDENT D'AFFICHAGE</Text>
      <Text style={{ fontFamily: F.sans, color: C.text, fontSize: 15, textAlign: "center", maxWidth: 520 }}>{error.message}</Text>
      <Text style={{ fontFamily: F.sans, color: C.muted, fontSize: 13, textAlign: "center", maxWidth: 520 }}>L'état de la partie est conservé par le serveur : réessayer recharge l'écran et resynchronise la session.</Text>
      <Pressable onPress={retry} style={{ borderWidth: 1, borderColor: C.brass, paddingVertical: 12, paddingHorizontal: 20 }}>
        <Text style={{ fontFamily: F.monoBold, color: C.text, letterSpacing: 2 }}>RÉESSAYER</Text>
      </Pressable>
    </View>
  );
}

/** Thème de navigation transparent : sans lui, React Navigation peint un fond uni qui masque la chronique. */
const NAV_THEME = { ...DarkTheme, colors: { ...DarkTheme.colors, background: "transparent", card: "transparent", border: "transparent" } };

SplashScreen.preventAutoHideAsync().catch(() => undefined);

/** Fond défilant permanent : il traverse tous les écrans et tous les chargements (jamais d'écran noir). */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Chronicle strength={0.9} />
      <ChronicleVeil />
      {children}
    </View>
  );
}

function Root() {
  const { ready } = useAuth();
  const [fonts] = useFonts({
    CormorantGaramond_400Regular, CormorantGaramond_500Medium_Italic, CormorantGaramond_600SemiBold,
    IBMPlexSans_400Regular, IBMPlexSans_500Medium, IBMPlexSans_600SemiBold, IBMPlexMono_400Regular, IBMPlexMono_600SemiBold,
  });
  useEffect(() => {
    if (fonts && ready) SplashScreen.hideAsync().catch(() => undefined);
  }, [fonts, ready]);
  if (!fonts || !ready) return <Shell><View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><Wordmark size={22} /></View></Shell>;
  return (
    <Shell><ThemeProvider value={NAV_THEME}><Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "transparent" }, animation: "fade", title: "GEONEX" }} /></ThemeProvider></Shell>
  );
}

export default function Layout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="light" />
        <Root />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
