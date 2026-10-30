import { ReactNode, useEffect, useState } from "react";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";
import { Link, router, usePathname } from "expo-router";
import { Wordmark } from "./Brand";
import { Backdrop, Screen, useLayout } from "./ui";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { A, C, F, S } from "../theme";

const AVATAR_COLORS: Record<string, string> = { navy: "#284D74", atlas: "#41698B", brass: "#B89A5D", red: "#963F46", stone: "#6B7684" };

/** Avatar institutionnel par défaut : monogramme du pseudonyme (aucune photo n'est demandée). */
export function Avatar({ name, color = "navy", size = 34 }: { name: string; color?: string; size?: number }) {
  const bg = AVATAR_COLORS[color] ?? AVATAR_COLORS.navy;
  return (
    <View accessible accessibilityLabel={`Avatar de ${name}`} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#F3F0E955" }}>
      <Text style={{ fontFamily: F.title, fontSize: size * 0.5, color: "#F3F0E9", lineHeight: size * 0.6 }}>{(name.trim()[0] ?? "?").toUpperCase()}</Text>
    </View>
  );
}

const FADE: any = Platform.OS === "web" ? { transitionProperty: "color, border-color, background-color", transitionDuration: "180ms" } : {};

function NavLink({ label, href, active, badge }: { label: string; href: string; active?: boolean; badge?: number }) {
  return (
    <Pressable accessibilityRole="link" accessibilityState={{ selected: !!active }} onPress={() => router.push(href as any)}
      style={({ hovered }: any) => [{ paddingVertical: 8, paddingHorizontal: 4, borderBottomWidth: 2, borderBottomColor: active ? C.brass : hovered ? C.lineHi : "transparent", flexDirection: "row", gap: 6, alignItems: "center" }, FADE]}>
      <Text style={{ fontFamily: F.monoBold, fontSize: 11, letterSpacing: 1.8, color: active ? C.text : C.muted, textTransform: "uppercase" }}>{label}</Text>
      {badge ? <View style={{ minWidth: 16, height: 16, borderRadius: 8, backgroundColor: C.redDeep, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 }}><Text style={{ color: "#fff", fontSize: 10, fontFamily: F.monoBold }}>{badge}</Text></View> : null}
    </Pressable>
  );
}

function MenuItem({ label, onPress, badge, danger }: { label: string; onPress: () => void; badge?: number; danger?: boolean }) {
  return (
    <Pressable accessibilityRole="menuitem" onPress={onPress} style={({ hovered }: any) => ({ paddingVertical: 10, paddingHorizontal: 16, backgroundColor: hovered ? C.panelHi : "transparent", flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 })}>
      <Text style={{ fontFamily: F.sansMed, fontSize: 14, color: danger ? C.red : C.text }}>{label}</Text>
      {badge ? <View style={{ minWidth: 18, height: 18, borderRadius: 9, backgroundColor: C.redDeep, alignItems: "center", justifyContent: "center", paddingHorizontal: 5 }}><Text style={{ color: "#fff", fontSize: 10.5, fontFamily: F.monoBold }}>{badge}</Text></View> : null}
    </Pressable>
  );
}

/** Navigation principale : visiteur (accueil, scénarios, documentation, méthodologie) ou compte connecté (+ menu du compte). */
export function SiteNav() {
  const { user, logout } = useAuth();
  const { phone, width } = useLayout();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [badge, setBadge] = useState({ invitations: 0, unread: 0 });
  useEffect(() => { setOpen(false); setMenu(false); }, [path]);
  useEffect(() => {
    if (!user) return setBadge({ invitations: 0, unread: 0 });
    api("/space/badge").then(setBadge).catch(() => undefined);
  }, [user?.id, path]);

  const signedIn = !!user && !user.isGuest;
  const links = signedIn
    ? [["Accueil", "/"], ["Centre des scénarios", "/library"], ["Mes simulations", "/space?tab=simulations"], ["Documentation", "/docs"]]
    : [["Accueil", "/"], ["Scénarios", "/library"], ["Documentation", "/docs"], ["Méthodologie", "/methodology"]];
  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href.split("?")[0]) && !(href.includes("tab=") && path === "/space" && false));
  const compact = phone || width < 940;

  const account = user ? (
    <View style={{ position: "relative", zIndex: 30 }}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: menu }} accessibilityLabel="Menu du compte" onPress={() => setMenu(!menu)} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Avatar name={user.displayName} color={user.avatarColor} size={32} />
        {!phone ? <Text numberOfLines={1} style={{ fontFamily: F.sansMed, fontSize: 13.5, color: C.text, maxWidth: 140 }}>{user.displayName}{user.isGuest ? " · invité" : ""}</Text> : null}
        {badge.invitations ? <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: C.redDeep }} /> : null}
        <Text style={{ color: C.muted, fontSize: 10 }}>▾</Text>
      </Pressable>
      {menu ? (
        <View accessibilityRole="menu" style={{ position: "absolute", right: 0, top: 44, minWidth: 230, backgroundColor: C.panel, borderWidth: 1, borderColor: C.lineHi, borderTopWidth: 2, borderTopColor: C.brass, paddingVertical: 6, zIndex: 40 }}>
          {user.isGuest ? <MenuItem label="Créer un compte" onPress={() => router.push("/auth?mode=register")} /> : null}
          <MenuItem label="Mon espace" onPress={() => router.push("/space")} />
          <MenuItem label="Mon profil" onPress={() => router.push("/space?tab=profile")} />
          <MenuItem label="Mes invitations" badge={badge.invitations} onPress={() => router.push("/space?tab=invitations")} />
          <MenuItem label="Paramètres" onPress={() => router.push("/space?tab=settings")} />
          {user.role === "owner" ? <MenuItem label="Administration" onPress={() => router.push("/admin")} /> : null}
          <View style={{ height: 1, backgroundColor: C.line, marginVertical: 4 }} />
          <MenuItem label="Déconnexion" danger onPress={async () => { await logout(); router.replace("/"); }} />
        </View>
      ) : null}
    </View>
  ) : (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
      <Pressable accessibilityRole="link" onPress={() => router.push("/auth?mode=login")}><Text style={{ fontFamily: F.monoBold, fontSize: 11, letterSpacing: 1.8, color: C.text }}>SE CONNECTER</Text></Pressable>
      <Pressable accessibilityRole="link" onPress={() => router.push("/auth?mode=register")} style={({ hovered }: any) => [{ borderWidth: 1, borderColor: C.brass, paddingVertical: 8, paddingHorizontal: 14, backgroundColor: hovered ? "#B89A5D26" : "transparent" }, FADE]}>
        <Text style={{ fontFamily: F.monoBold, fontSize: 11, letterSpacing: 1.8, color: C.brass }}>S'INSCRIRE</Text>
      </Pressable>
    </View>
  );

  return (
    <View style={{ zIndex: 20, marginBottom: S(phone ? 6 : 8) }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: S(4), paddingVertical: 4 }}>
        <Pressable accessibilityRole="link" accessibilityLabel="GEONEX, accueil" onPress={() => router.push("/")}><Wordmark size={phone ? 15 : 18} /></Pressable>
        {!compact ? (
          <View style={{ flexDirection: "row", gap: S(5), alignItems: "center" }}>
            {links.map(([l, h]) => <NavLink key={h} label={l} href={h} active={isActive(h)} />)}
          </View>
        ) : null}
        <View style={{ flexDirection: "row", alignItems: "center", gap: S(4) }}>
          {!(compact && !user) ? account : null}
          {compact ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Menu de navigation" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={{ borderWidth: 1, borderColor: C.lineHi, paddingVertical: 7, paddingHorizontal: 10 }}>
              <Text style={{ fontFamily: F.monoBold, fontSize: 11, letterSpacing: 1.6, color: C.text }}>{open ? "FERMER" : "MENU"}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      {compact && open ? (
        <View style={{ backgroundColor: C.panel, borderWidth: 1, borderColor: C.lineHi, borderTopWidth: 2, borderTopColor: C.brass, padding: S(3), gap: 2 }}>
          {links.map(([l, h]) => <NavLink key={h} label={l} href={h} active={isActive(h)} />)}
          {!user ? (
            <View style={{ flexDirection: "row", gap: S(4), paddingTop: S(3) }}>
              <Pressable accessibilityRole="link" onPress={() => router.push("/auth?mode=login")}><Text style={{ fontFamily: F.monoBold, fontSize: 11.5, letterSpacing: 1.8, color: C.text }}>SE CONNECTER</Text></Pressable>
              <Pressable accessibilityRole="link" onPress={() => router.push("/auth?mode=register")}><Text style={{ fontFamily: F.monoBold, fontSize: 11.5, letterSpacing: 1.8, color: C.brass }}>S'INSCRIRE</Text></Pressable>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export function SiteFooter() {
  const link = (label: string, href: string) => (
    <Link key={href} href={href as any} asChild><Pressable accessibilityRole="link"><Text style={{ color: C.muted, fontFamily: F.mono, fontSize: 11 }}>{label}</Text></Pressable></Link>
  );
  return (
    <View style={{ marginTop: S(14), paddingTop: S(5), borderTopWidth: 1, borderTopColor: C.line, gap: S(3) }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S(5) }}>
        {link("Centre des scénarios", "/library")}{link("Documentation", "/docs")}{link("Méthodologie & fiabilité", "/methodology")}
        {link("Conditions d'utilisation", "/terms")}{link("Confidentialité", "/privacy")}{link("Crédits des images", "/credits")}
      </View>
      <Text style={{ color: C.faint, fontFamily: F.titleItalic, fontSize: 14 }}>Comprendre le monde. Simuler ses transformations.</Text>
      <Text style={{ color: C.faint, fontFamily: F.mono, fontSize: 10.5 }}>GEONEX · gratuit · sans publicité</Text>
    </View>
  );
}

/** Page publique ou de compte : navigation, contenu, pied de page, sur le fond de la Chronique. */
export function PageScreen({ children, max = 1180, chronicle = 0.85, scrollRef, footer = true }: { children: ReactNode; max?: number; chronicle?: number; scrollRef?: any; footer?: boolean }) {
  return (
    <Screen max={max} chronicle={chronicle} scrollRef={scrollRef}>
      <SiteNav />
      {children}
      {footer ? <SiteFooter /> : null}
    </Screen>
  );
}

/** Surface éditoriale claire (ivoire) pour les contenus à lire : documentation, méthodologie, mentions. */
export function Paper({ children, style }: { children: ReactNode; style?: any }) {
  return <View style={[{ backgroundColor: A.ivory, borderWidth: 1, borderColor: "#D7CFBA", borderTopWidth: 3, borderTopColor: C.brass, padding: S(6), gap: S(3) }, style]}>{children}</View>;
}
