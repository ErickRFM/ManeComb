import { Text, View } from 'react-native';
import { Link } from '@/src/navigation/router';
import { authStyles as s } from '../auth.styles';

export function AuthLegalLinks() {
  return (
    <View style={s.legalBlock}>
      <View style={s.legalLine}>
        <Text style={s.legalText}>Al continuar aceptas</Text>
        <Link href="/terminos" style={s.legalLink}>
          Terminos
        </Link>
        <Text style={s.legalText}>y</Text>
        <Link href="/privacidad" style={s.legalLink}>
          Privacidad.
        </Link>
      </View>
    </View>
  );
}
