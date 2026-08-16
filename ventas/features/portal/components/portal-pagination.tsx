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
        <Text style={styles.page}>Página {safePage} de {totalPages}</Text>
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
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppTheme.spacing.sm,
    justifyContent: 'space-between',
    paddingTop: AppTheme.spacing.xs,
  },
  actions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: AppTheme.spacing.xs,
  },
  label: {
    color: portalPalette.muted,
    fontFamily: Typography.body,
    fontSize: 11,
    fontWeight: '700',
  },
  page: {
    color: portalPalette.text,
    fontFamily: Typography.body,
    fontSize: 11,
    fontWeight: '800',
  },
});
