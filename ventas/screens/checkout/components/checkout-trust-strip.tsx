import { Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { palette } from '../checkout.constants';
import { styles as s } from '../checkout.styles';

function TrustItem({
  body,
  icon,
  title,
}: {
  body: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
}) {
  return (
    <View style={s.trustItem}>
      <View style={s.trustIcon}>
        <MaterialCommunityIcons name={icon} size={24} color={palette.violet} />
      </View>
      <View style={s.trustCopy}>
        <Text style={s.trustTitle}>{title}</Text>
        <Text style={s.trustBody}>{body}</Text>
      </View>
    </View>
  );
}

type Props = {
  buttonAmount: string;
};

export function CheckoutTrustStrip({ buttonAmount }: Props) {
  return (
    <View style={s.trustStrip}>
      <TrustItem
        icon="shield-lock-outline"
        title="Conexión protegida"
        body="El checkout usa HTTPS y ManeComb no almacena el número completo ni el CVV de tu tarjeta."
      />
      <TrustItem icon="file-document-outline" title="Comprobante comercial" body="Consulta el resultado de tu orden desde el portal." />
      <TrustItem icon="calendar-refresh-outline" title="Importe mensual" body={`El plan seleccionado suma ${buttonAmount} al mes.`} />
    </View>
  );
}
