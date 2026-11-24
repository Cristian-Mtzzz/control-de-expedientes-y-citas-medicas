import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Agenda from './pages/Agenda.jsx';
import Pacientes from './pages/Pacientes.jsx';
import Ficha from './pages/Ficha.jsx';
import Seguimiento from './pages/Seguimiento.jsx';
import Usuarios from './pages/Usuarios.jsx';

export default function App() {
  const { usuario, cargando } = useAuth();
  if (cargando) return <div className="cargando">Cargando…</div>;
  if (!usuario) return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/agenda" element={<Agenda />} />
        <Route path="/pacientes" element={<Pacientes />} />
        <Route path="/pacientes/:id" element={<Ficha />} />
        <Route path="/seguimiento" element={<Seguimiento />} />
        {usuario.rol === 'admin' && <Route path="/usuarios" element={<Usuarios />} />}
        <Route path="*" element={<Navigate to="/agenda" replace />} />
      </Route>
    </Routes>
  );
}
