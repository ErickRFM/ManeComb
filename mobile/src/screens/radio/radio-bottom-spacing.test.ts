import { AppTheme, getAppTheme } from '@/constants/theme';
import { createStyles } from './radio-screen.styles';

const fs = jest.requireActual('fs') as { readFileSync: (path: string, encoding: string) => string };

describe('Radio bottom tab layout contract (physical layout remains a device gate)', () => {
  it.each([
    { height: 640, width: 320, fontScale: 1 },
    { height: 640, width: 360, fontScale: 1.3 },
    { height: 920, width: 412, fontScale: 1 },
    { height: 920, width: 412, fontScale: 2 },
  ])('reserves token spacing and equal touch targets for $width x $height at fontScale $fontScale', ({ height, fontScale }) => {
    const styles = createStyles(getAppTheme('light'), false, true, height < 820 || fontScale >= 1.3);
    expect(styles.pageIndicators.paddingBottom).toBe(AppTheme.spacing.sm);
    expect(styles.pageIndicators.paddingBottom).toBe(10);
    expect(styles.pageIndicatorHit.minHeight).toBeGreaterThanOrEqual(44);
    expect(styles.pageIndicatorHit.flex).toBe(1);
    expect(styles.pageIndicatorHit.minWidth).toBe(0);
    expect(styles.pageIndicatorText.flexShrink).toBe(1);
    expect(styles.pageIndicatorText.minWidth).toBe(0);
    expect(styles.pagerShell.flex).toBe(1);
    expect(styles.pagerShell.minHeight).toBe(0);
    expect(styles.consolePageContent.paddingBottom).toBe(0);
  });

  it('retains tab roles, selected state, all labels, font fitting and existing pager navigation', () => {
    const view = fs.readFileSync('src/screens/radio/radio-screen-view.tsx', 'utf8');
    const tabs = view.slice(view.indexOf('<View accessibilityRole="tablist"'));
    expect(tabs).toContain('accessibilityRole="tab"');
    expect(tabs).toContain('accessibilityLabel={`Ir a ${label}`}');
    expect(tabs).toContain('accessibilityState={{ selected: activePageIndex === index }}');
    expect(tabs).toContain('onPress={() => goToPage(index as RadioPageIndex)}');
    expect(tabs).toContain('numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}');
    expect(view).not.toContain('SafeAreaView');
    expect(tabs).not.toContain('ScrollView');
    expect(fs.readFileSync('src/screens/radio/constants.ts', 'utf8')).toContain("['Canales', 'Radio', 'Audios']");
  });
});
