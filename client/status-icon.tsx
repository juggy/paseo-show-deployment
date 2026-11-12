import type { PluginButtonIconProps } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/ui";
import { type ComponentType, useEffect, useRef } from "react";
import { Animated, Easing } from "react-native";
import type { DeploymentTone } from "../shared/deployment";

function colorFor(tone: DeploymentTone, colors: PluginButtonIconProps["theme"]["colors"]): string {
  switch (tone) {
    case "pending":
      return colors.statusWarning;
    case "success":
      return colors.statusSuccess;
    case "failure":
      return colors.statusDanger;
    case "inactive":
      return colors.foregroundMuted;
  }
}

function Pulse({ children }: { children: React.ReactNode }) {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.35, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return <Animated.View style={{ opacity }}>{children}</Animated.View>;
}

const cache = new Map<DeploymentTone, ComponentType<PluginButtonIconProps>>();

/** One stable icon component per tone, so `update({ icon })` only changes identity when the tone changes. */
export function statusIcon(tone: DeploymentTone): ComponentType<PluginButtonIconProps> {
  const existing = cache.get(tone);
  if (existing) return existing;
  function DeploymentStatusIcon({ theme, size }: PluginButtonIconProps) {
    const icon = <Icon name="Rocket" size={size} color={colorFor(tone, theme.colors)} />;
    return tone === "pending" ? <Pulse>{icon}</Pulse> : icon;
  }
  cache.set(tone, DeploymentStatusIcon);
  return DeploymentStatusIcon;
}
