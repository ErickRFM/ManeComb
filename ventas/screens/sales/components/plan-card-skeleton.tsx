import { View } from 'react-native';
import { styles } from '../styles';

function SkeletonBar({ width, height = 14 }: { width: number | string; height?: number }) {
  return (
    <View style={[styles.skeletonBar, { width, height }]}>
      <View pointerEvents="none" style={styles.skeletonShine} />
    </View>
  );
}

export function PlanCardSkeleton({ width }: { width: number }) {
  return (
    <View style={[styles.planCardSkeleton, { width }]}>
      <View style={styles.planSkeletonHeader}>
        <SkeletonBar width="52%" height={11} />
        <SkeletonBar width={34} height={34} />
      </View>
      <SkeletonBar width="64%" height={26} />
      <SkeletonBar width="86%" height={12} />
      <SkeletonBar width="46%" height={30} />
      <View style={styles.planSkeletonRows}>
        <SkeletonBar width="72%" height={12} />
        <SkeletonBar width="66%" height={12} />
        <SkeletonBar width="70%" height={12} />
      </View>
      <SkeletonBar width="100%" height={46} />
    </View>
  );
}
