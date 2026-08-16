import { StyleSheet, Text, View } from 'react-native';
import { AppTheme, Typography } from '@/constants/theme';
import { PortalButton } from './portal-button';
import { portalPalette } from '../portal-theme';

type PortalPaginationProps = {
  itemLabel?: string;
  onPageChange: (page: number) => void;
  page: number;
  pageSize: number;
  totalItems: number;
};

export function PortalPagination({
  itemLabel = 'registros',
  onPageChange,
  page,
  pageSize,
  totalItems,
}: PortalPaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  if (totalItems <= pageSize) return null;

  const safePage = Math.min(Math.max(page, 1), totalPages);
  const first = (safePage - 1) * pageSize + 1;
  const last = Math.min(totalItems, safePage * pageSize);

  return (
    <View style={styles.row}>
      <Text style={styles.label}>{first}–{last} de {totalItems} {itemLabel}</Text>
      <View style={styles.actions}>
        <PortalButton
          accessibilityLabel="Página anterior"
          disabled={safePage <= 1}
          icon="chevron-left"
          onPress={() => onPageChange(safePage - 1)}
          size="sm"
          variant="icon"
        />
        <View style={styles.pagePill}>
          <Text style={styles.page}>Página {safePage} / {totalPages}</Text>
        </View>
        <PortalButton
          accessibilityLabel="Página siguiente"
          disabled={safePage >= totalPages}
          icon="chevron-right"
          onPress={() => onPageChange(safePage + 1)}
          size="sm"
          variant="icon"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    backgroundColor: portalPalette.surfaceSoft,
    borderColor: portalPalette.line,
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppTheme.spacing.sm,
    justifyContent: 'space-between',
    paddingHorizontal: AppTheme.spacing.sm,
    paddingVertical: 8,
  },
  actions: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 0,
    gap: AppTheme.spacing.xs,
  },
  label: {
    color: portalPalette.muted,
    flexShrink: 1,
    fontFamily: Typography.body,
    fontSize: 11,
    fontWeight: '700',
  },
  pagePill: {
    alignItems: 'center',
    backgroundColor: portalPalette.surface,
    borderColor: portalPalette.line,
    borderRadius: AppTheme.radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 32,
    paddingHorizontal: 10,
  },
  page: {
    color: portalPalette.text,
    fontFamily: Typography.body,
    fontSize: 11,
    fontWeight: '800',
  },
});
