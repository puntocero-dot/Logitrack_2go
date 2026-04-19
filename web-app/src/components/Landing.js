import React, { Suspense } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Map, Cpu, TrendingUp, ShieldAlert, Zap, Truck } from 'lucide-react';
import '../landing.css';

// Lazy load the 3D scene so it doesn't block initial render
const Scene3D = React.lazy(() => import('./Scene3D'));

export default function Landing() {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { 
      opacity: 1,
      transition: { staggerChildren: 0.2, delayChildren: 0.3 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 30 },
    visible: { 
      opacity: 1, 
      y: 0,
      transition: { type: 'spring', stiffness: 100, damping: 20 }
    }
  };

  return (
    <div className="landing-page">
      {/* Navigation */}
      <nav className="landing-nav">
        <Link to="/" className="logo">
          <Truck strokeWidth={2.5} size={28} color="#3b82f6" />
          Logitrack
        </Link>
        <div className="nav-actions">
          <Link to="/login" className="btn-login-outline">
            Ingresar
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="hero-section">
        {/* The 3D Canvas Background */}
        <div className="canvas-container">
          <Suspense fallback={null}>
            <Scene3D />
          </Suspense>
        </div>

        <motion.div 
          className="hero-content"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <motion.div variants={itemVariants} className="badge-new">
            v3.0 Inteligencia Logística
          </motion.div>
          <motion.h1 variants={itemVariants} className="hero-title">
            El futuro de la distribución rápida
          </motion.h1>
          <motion.p variants={itemVariants} className="hero-subtitle">
            Logitrack optimiza tus rutas en tiempo real usando inteligencia artificial.
            Reduce tiempos de entrega, monitorea tus motos en vivo y toma el control total de tu operación.
          </motion.p>
          <motion.div variants={itemVariants} className="hero-actions">
            <Link to="/login" className="btn-primary-large">
              Empezar ahora <Zap size={20} />
            </Link>
          </motion.div>
        </motion.div>
      </section>

      {/* Features Bento Grid */}
      <section className="features-section">
        <div className="section-header">
          <motion.h2 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="section-title"
          >
            Potencia tu logística
          </motion.h2>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="section-subtitle"
          >
            Nuestras herramientas están diseñadas para darte la máxima visibilidad y control sobre tu flota.
          </motion.p>
        </div>

        <div className="bento-grid">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="bento-card wide"
          >
            <div className="bento-icon">
              <Map size={28} />
            </div>
            <h3 className="bento-title">Tracking en tiempo real (GPS)</h3>
            <p className="bento-desc">
              Visualiza cada moto en un mapa interactivo. Sabrás exactamente dónde están tus conductores y qué pedidos llevan en todo momento, actualizando coordenadas segundo a segundo.
            </p>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="bento-card"
          >
            <div className="bento-icon">
              <Cpu size={28} />
            </div>
            <h3 className="bento-title">Algoritmo Inteligente</h3>
            <p className="bento-desc">
              Agrupación automática de pedidos basada en distancia y zona, calculando la ruta más corta (Problema del Viajante TSP) al instante.
            </p>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="bento-card"
          >
            <div className="bento-icon">
              <TrendingUp size={28} />
            </div>
            <h3 className="bento-title">KPIs y Analítica</h3>
            <p className="bento-desc">
              Mide el rendimiento. Tiempos promedio de entrega, pedidos cancelados vs entregados, y rendimiento por conductor.
            </p>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 }}
            className="bento-card wide"
          >
            <div className="bento-icon">
              <ShieldAlert size={28} />
            </div>
            <h3 className="bento-title">Sistema de Roles Avanzado</h3>
            <p className="bento-desc">
              Accesos segmentados para Superadmin, Gerentes, Coordinadores, Supervisores y Repartidores. Cada quien ve solo lo que necesita, protegiendo tu data.
            </p>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
