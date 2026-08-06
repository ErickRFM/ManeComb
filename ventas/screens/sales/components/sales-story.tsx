import { Platform, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { Typography } from '@/constants/theme';
import { heroSignals, neonPalette, platformPillars } from '../constants';
import { webStyle } from '../utils';

export function HeroSignalRow({ compact }: { compact: boolean }) {
  return (
    <View style={[localStyles.signalRow, compact ? localStyles.signalRowCompact : undefined]}>
      {heroSignals.map((signal) => (
        <View
          key={signal.label}
          style={[
            localStyles.signalChip,
            compact ? localStyles.signalChipCompact : undefined,
            { borderColor: `${signal.color}44`, backgroundColor: `${signal.color}0F` },
            webStyle({ boxShadow: `inset 0 0 0 1px ${signal.color}10` }),
          ]}>
          <MaterialCommunityIcons name={signal.icon} size={15} color={signal.color} />
          <Text style={[localStyles.signalLabel, compact ? localStyles.signalLabelCompact : undefined]}>
            {signal.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

function EcosystemNode({
  body,
  color,
  icon,
  title,
}: {
  body: string;
  color: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
}) {
  return (
    <View
      style={[
        localStyles.ecosystemNode,
        { borderColor: `${color}55`, backgroundColor: `${color}0D` },
        webStyle({
          backgroundImage: `linear-gradient(145deg, rgba(10, 17, 39, 0.96), ${color}10)`,
          boxShadow: `0 16px 42px rgba(0, 0, 0, 0.24), inset 0 0 0 1px ${color}16`,
        }),
      ]}>
      <View style={[localStyles.ecosystemIcon, { backgroundColor: `${color}16`, borderColor: `${color}50` }]}>
        <MaterialCommunityIcons name={icon} size={24} color={color} />
      </View>
      <View style={localStyles.ecosystemCopy}>
        <Text style={localStyles.ecosystemTitle}>{title}</Text>
        <Text style={localStyles.ecosystemBody}>{body}</Text>
      </View>
    </View>
  );
}

export function PlatformOverview({ compact }: { compact: boolean }) {
  return (
    <View
      nativeID="funcionalidades"
      style={[
        localStyles.platformShell,
        compact ? localStyles.platformShellCompact : undefined,
        webStyle({
          backgroundImage:
            'linear-gradient(145deg, rgba(8, 13, 30, 0.96), rgba(11, 19, 43, 0.9)), radial-gradient(circle at 12% 10%, rgba(0, 194, 255, 0.12), transparent 30%), radial-gradient(circle at 88% 18%, rgba(255, 45, 122, 0.12), transparent 32%)',
          boxShadow: '0 0 0 1px rgba(245, 247, 255, 0.08), 0 30px 90px rgba(0, 0, 0, 0.34)',
          scrollMarginTop: 120,
          backdropFilter: 'blur(18px)',
        }),
      ]}>
      <View style={[localStyles.platformHeader, compact ? localStyles.platformHeaderCompact : undefined]}>
        <View style={localStyles.platformHeaderCopy}>
          <Text style={localStyles.eyebrow}>MÁS QUE UN MAPA</Text>
          <Text style={[localStyles.platformTitle, compact ? localStyles.platformTitleCompact : undefined]}>
            ManeComb conecta toda la operación, no solo la ubicación.
          </Text>
          <Text style={localStyles.platformIntro}>
            El portal administrativo organiza la flotilla. La app móvil acompaña al conductor. El backend mantiene rutas,
            mensajes, alertas y evidencia sincronizados en tiempo real.
          </Text>
        </View>

        <View style={[localStyles.ecosystem, compact ? localStyles.ecosystemCompact : undefined]}>
          <EcosystemNode
            icon="monitor-dashboard"
            color={neonPalette.violet}
            title="Portal administrativo"
            body="Planes, usuarios, permisos, unidades, rutas, documentos y seguimiento."
          />
          <View style={localStyles.ecosystemBridge}>
            <View style={[localStyles.bridgeLine, { backgroundColor: neonPalette.cyan }]} />
            <View style={localStyles.bridgeIcon}>
              <MaterialCommunityIcons name="sync" size={20} color={neonPalette.cyan} />
            </View>
            <View style={[localStyles.bridgeLine, { backgroundColor: neonPalette.accent }]} />
          </View>
          <EcosystemNode
            icon="cellphone-marker"
            color={neonPalette.accent}
            title="App operativa"
            body="GPS, jornadas, rutas, chat, radio, llamadas, checklist e incidencias."
          />
        </View>
      </View>

      <View style={[localStyles.pillarGrid, compact ? localStyles.pillarGridCompact : undefined]}>
        {platformPillars.map((pillar, index) => (
          <View
            key={pillar.title}
            style={[
              localStyles.pillarCard,
              compact ? localStyles.pillarCardCompact : undefined,
              { borderColor: `${pillar.color}3F` },
              webStyle({
                backgroundImage: `linear-gradient(150deg, rgba(10, 17, 38, 0.94), ${pillar.color}0C)`,
                boxShadow: `0 16px 42px rgba(0, 0, 0, 0.2), inset 0 0 0 1px ${pillar.color}10`,
                transitionDelay: `${index * 35}ms`,
              }),
            ]}>
            <View style={localStyles.pillarTop}>
              <View
                style={[
                  localStyles.pillarIcon,
                  { borderColor: `${pillar.color}55`, backgroundColor: `${pillar.color}14` },
                ]}>
                <MaterialCommunityIcons name={pillar.icon} size={25} color={pillar.color} />
              </View>
              <Text style={[localStyles.pillarEyebrow, { color: pillar.color }]}>{pillar.eyebrow}</Text>
            </View>
            <Text style={localStyles.pillarTitle}>{pillar.title}</Text>
            <Text style={localStyles.pillarBody}>{pillar.body}</Text>
            <View style={localStyles.featureList}>
              {pillar.features.map((feature) => (
                <View key={feature} style={localStyles.featureChip}>
                  <MaterialCommunityIcons name="check" size={13} color={pillar.color} />
                  <Text style={localStyles.featureLabel}>{feature}</Text>
                </View>
              ))}
            </View>
          </View>
        ))}
      </View>

      <View style={localStyles.outcomeStrip}>
        <View style={localStyles.outcomeIcon}>
          <MaterialCommunityIcons name="transit-connection-variant" size={23} color={neonPalette.mint} />
        </View>
        <View style={localStyles.outcomeCopy}>
          <Text style={localStyles.outcomeTitle}>De la planeación al cierre de jornada, sin brincar entre sistemas.</Text>
          <Text style={localStyles.outcomeBody}>
            Una sola fuente de información para administración, despacho, supervisión y conductores.
          </Text>
        </View>
      </View>
    </View>
  );
}


const localStyles = StyleSheet.create({
  signalRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  signalRowCompact: {
    gap: 7,
  },
  signalChip: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 7,
    minHeight: 34,
    paddingHorizontal: 11,
  },
  signalChipCompact: {
    flexGrow: 1,
    minHeight: 32,
    paddingHorizontal: 9,
  },
  signalLabel: {
    color: neonPalette.mutedStrong,
    fontFamily: Typography.body,
    fontSize: 11.5,
    fontWeight: '800',
  },
  signalLabelCompact: {
    fontSize: 10.5,
  },
  platformShell: {
    borderColor: 'rgba(245, 247, 255, 0.09)',
    borderRadius: 18,
    borderWidth: 1,
    gap: 24,
    overflow: 'hidden',
    padding: 28,
  },
  platformShellCompact: {
    borderRadius: 14,
    gap: 18,
    padding: 16,
  },
  platformHeader: {
    alignItems: 'stretch',
    flexDirection: 'row',
    gap: 28,
  },
  platformHeaderCompact: {
    flexDirection: 'column',
    gap: 20,
  },
  platformHeaderCopy: {
    flex: 0.85,
    gap: 10,
    justifyContent: 'center',
  },
  eyebrow: {
    color: neonPalette.accent,
    fontFamily: Typography.body,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  platformTitle: {
    color: neonPalette.text,
    fontFamily: Typography.display,
    fontSize: 34,
    fontWeight: '900',
    lineHeight: 40,
  },
  platformTitleCompact: {
    fontSize: 27,
    lineHeight: 33,
  },
  platformIntro: {
    color: neonPalette.mutedStrong,
    fontFamily: Typography.body,
    fontSize: 14.5,
    lineHeight: 23,
  },
  ecosystem: {
    flex: 1.15,
    gap: 10,
    justifyContent: 'center',
  },
  ecosystemCompact: {
    gap: 8,
  },
  ecosystemNode: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 96,
    padding: 14,
  },
  ecosystemIcon: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  ecosystemCopy: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  ecosystemTitle: {
    color: neonPalette.text,
    fontFamily: Typography.display,
    fontSize: 15,
    fontWeight: '900',
  },
  ecosystemBody: {
    color: neonPalette.muted,
    fontFamily: Typography.body,
    fontSize: 12.5,
    lineHeight: 18,
  },
  ecosystemBridge: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    minHeight: 24,
    paddingHorizontal: 30,
  },
  bridgeLine: {
    flex: 1,
    height: 1,
    opacity: 0.7,
  },
  bridgeIcon: {
    alignItems: 'center',
    borderColor: 'rgba(0, 194, 255, 0.32)',
    borderRadius: 18,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    marginHorizontal: 8,
    width: 36,
  },
  pillarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  pillarGridCompact: {
    flexDirection: 'column',
  },
  pillarCard: {
    borderRadius: 14,
    borderWidth: 1,
    flexBasis: 250,
    flexGrow: 1,
    gap: 11,
    minHeight: 260,
    padding: 18,
  },
  pillarCardCompact: {
    flexBasis: 'auto' as any,
    minHeight: 0,
    width: '100%',
  },
  pillarTop: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  pillarIcon: {
    alignItems: 'center',
    borderRadius: 11,
    borderWidth: 1,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  pillarEyebrow: {
    fontFamily: Typography.body,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  pillarTitle: {
    color: neonPalette.text,
    fontFamily: Typography.display,
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 23,
  },
  pillarBody: {
    color: neonPalette.muted,
    fontFamily: Typography.body,
    fontSize: 13,
    lineHeight: 20,
  },
  featureList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: 'auto' as any,
  },
  featureChip: {
    alignItems: 'center',
    backgroundColor: 'rgba(245, 247, 255, 0.045)',
    borderColor: 'rgba(245, 247, 255, 0.08)',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    minHeight: 28,
    paddingHorizontal: 8,
  },
  featureLabel: {
    color: neonPalette.mutedStrong,
    fontFamily: Typography.body,
    fontSize: 10.5,
    fontWeight: '800',
  },
  outcomeStrip: {
    alignItems: 'center',
    backgroundColor: 'rgba(47, 255, 213, 0.055)',
    borderColor: 'rgba(47, 255, 213, 0.2)',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 14,
  },
  outcomeIcon: {
    alignItems: 'center',
    backgroundColor: neonPalette.mintSoft,
    borderRadius: 12,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  outcomeCopy: {
    flex: 1,
    gap: 3,
  },
  outcomeTitle: {
    color: neonPalette.text,
    fontFamily: Typography.display,
    fontSize: 14.5,
    fontWeight: '900',
  },
  outcomeBody: {
    color: neonPalette.muted,
    fontFamily: Typography.body,
    fontSize: 12,
    lineHeight: 18,
  },
  pressed: {
    opacity: 0.86,
    transform: [{ scale: 0.99 }],
  },
});
