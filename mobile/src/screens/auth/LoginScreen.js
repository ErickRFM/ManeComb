import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity } from "react-native";
import api from "../../api/client";
import useAuthStore from "../../store/authStore";

export default function LoginScreen() {
  const login = useAuthStore((state) => state.login);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = async () => {
    try {
      const res = await api.post("/auth/login", {
        email,
        password
      });

      login(res.data);
    } catch (error) {
      console.log(error.response?.data || error.message);
    }
  };

  return (
    <View style={{ flex:1, justifyContent:"center", padding:20 }}>
      <Text style={{ fontSize:28, fontWeight:"bold", marginBottom:20 }}>
        Combis App 🚐
      </Text>

      <TextInput
        placeholder="Correo"
        value={email}
        onChangeText={setEmail}
        style={{
          borderWidth:1,
          padding:12,
          marginBottom:10,
          borderRadius:10
        }}
      />

      <TextInput
        placeholder="Contraseña"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        style={{
          borderWidth:1,
          padding:12,
          marginBottom:20,
          borderRadius:10
        }}
      />

      <TouchableOpacity
        onPress={handleLogin}
        style={{
          backgroundColor:"#111",
          padding:15,
          borderRadius:10
        }}
      >
        <Text style={{ color:"#fff", textAlign:"center" }}>
          Entrar
        </Text>
      </TouchableOpacity>
    </View>
  );
}