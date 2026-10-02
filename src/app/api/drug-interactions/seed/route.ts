import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { prisma } from '@/infra/db/prisma';

const COMMON_INTERACTIONS = [
  // HIGH severity
  { drugA: 'warfarina', drugB: 'ibuprofeno', severity: 'HIGH', description: 'Riesgo elevado de hemorragia. Los AINEs inhiben la función plaquetaria y potencian el efecto anticoagulante.', recommendation: 'Evitar combinación. Usar paracetamol como alternativa analgésica.' },
  { drugA: 'warfarina', drugB: 'aspirina', severity: 'HIGH', description: 'Riesgo muy elevado de sangrado gastrointestinal y hemorragia.', recommendation: 'Contraindicado excepto bajo indicación médica estricta con monitoreo de INR.' },
  { drugA: 'metformina', drugB: 'alcohol etílico', severity: 'HIGH', description: 'Riesgo de acidosis láctica potencialmente mortal.', recommendation: 'Advertir al paciente sobre evitar consumo de alcohol.' },
  { drugA: 'simvastatina', drugB: 'gemfibrozilo', severity: 'HIGH', description: 'Riesgo significativo de rabdomiólisis (destrucción muscular).', recommendation: 'Evitar combinación. Considerar fenofibrato como alternativa.' },
  { drugA: 'metronidazol', drugB: 'alcohol etílico', severity: 'HIGH', description: 'Efecto disulfiram: náuseas severas, vómitos, taquicardia, hipotensión.', recommendation: 'No consumir alcohol durante el tratamiento ni 48h después.' },
  { drugA: 'enalapril', drugB: 'espironolactona', severity: 'HIGH', description: 'Riesgo de hiperpotasemia severa que puede causar arritmias cardíacas.', recommendation: 'Monitorear potasio sérico frecuentemente si se usa combinación.' },
  { drugA: 'ciprofloxacino', drugB: 'teofilina', severity: 'HIGH', description: 'Ciprofloxacino inhibe el metabolismo de teofilina, riesgo de toxicidad (convulsiones, arritmias).', recommendation: 'Reducir dosis de teofilina 50% o usar otra quinolona.' },
  { drugA: 'ketoconazol', drugB: 'terfenadina', severity: 'HIGH', description: 'Riesgo de arritmias cardíacas graves (torsades de pointes).', recommendation: 'Combinación contraindicada.' },
  { drugA: 'litio', drugB: 'ibuprofeno', severity: 'HIGH', description: 'AINEs reducen excreción renal de litio causando toxicidad (temblor, confusión, convulsiones).', recommendation: 'Evitar AINEs. Usar paracetamol. Si es necesario, monitorear niveles de litio.' },
  { drugA: 'clopidogrel', drugB: 'omeprazol', severity: 'HIGH', description: 'Omeprazol reduce la activación de clopidogrel en hasta 45%, disminuyendo su efecto antiagregante.', recommendation: 'Usar pantoprazol como alternativa (menor interacción).' },

  // MODERATE severity
  { drugA: 'amoxicilina', drugB: 'anticonceptivos orales', severity: 'MODERATE', description: 'Puede reducir la eficacia de anticonceptivos orales por alteración de flora intestinal.', recommendation: 'Usar método anticonceptivo adicional durante el tratamiento.' },
  { drugA: 'diclofenaco', drugB: 'antihipertensivos', severity: 'MODERATE', description: 'AINEs pueden reducir el efecto de antihipertensivos por retención de sodio y agua.', recommendation: 'Monitorear presión arterial. Considerar paracetamol.' },
  { drugA: 'metformina', drugB: 'medios de contraste yodados', severity: 'MODERATE', description: 'Riesgo de acidosis láctica por deterioro de función renal post-contraste.', recommendation: 'Suspender metformina 48h antes y después del estudio con contraste.' },
  { drugA: 'losartán', drugB: 'potasio', severity: 'MODERATE', description: 'Riesgo de hiperpotasemia. Los ARA-II elevan el potasio sérico.', recommendation: 'Evitar suplementos de potasio. Monitorear electrolitos.' },
  { drugA: 'amoxicilina', drugB: 'metotrexato', severity: 'MODERATE', description: 'Amoxicilina puede reducir la excreción renal de metotrexato, aumentando toxicidad.', recommendation: 'Monitorear hemograma y función renal.' },
  { drugA: 'alprazolam', drugB: 'alcohol etílico', severity: 'MODERATE', description: 'Potenciación de depresión del SNC: sedación excesiva, depresión respiratoria.', recommendation: 'Evitar consumo de alcohol. Advertir sobre conducción de vehículos.' },
  { drugA: 'captopril', drugB: 'alopurinol', severity: 'MODERATE', description: 'Mayor riesgo de reacciones de hipersensibilidad y leucopenia.', recommendation: 'Monitorear hemograma. Vigilar reacciones cutáneas.' },
  { drugA: 'ciprofloxacino', drugB: 'antiácidos', severity: 'MODERATE', description: 'Antiácidos con aluminio/magnesio reducen absorción de ciprofloxacino hasta 90%.', recommendation: 'Administrar ciprofloxacino 2h antes o 6h después del antiácido.' },
  { drugA: 'furosemida', drugB: 'gentamicina', severity: 'MODERATE', description: 'Ambos son ototóxicos y nefrotóxicos. Riesgo aditivo de daño renal y auditivo.', recommendation: 'Monitorear función renal y audiometría si es posible.' },
  { drugA: 'digoxina', drugB: 'amiodarona', severity: 'MODERATE', description: 'Amiodarona aumenta niveles de digoxina en 70-100%, riesgo de toxicidad digitálica.', recommendation: 'Reducir dosis de digoxina al 50% al iniciar amiodarona.' },
  { drugA: 'fluoxetina', drugB: 'tramadol', severity: 'MODERATE', description: 'Riesgo de síndrome serotoninérgico: agitación, temblor, hipertermia, diarrea.', recommendation: 'Evitar combinación o usar dosis bajas con monitoreo estrecho.' },
  { drugA: 'paracetamol', drugB: 'warfarina', severity: 'MODERATE', description: 'Uso prolongado de paracetamol (>2g/día) puede potenciar efecto anticoagulante.', recommendation: 'Limitar dosis y duración. Monitorear INR si uso >1 semana.' },
  { drugA: 'amlodipino', drugB: 'simvastatina', severity: 'MODERATE', description: 'Amlodipino aumenta concentración de simvastatina, mayor riesgo de miopatía.', recommendation: 'No exceder 20mg de simvastatina con amlodipino.' },
  { drugA: 'hierro', drugB: 'levotiroxina', severity: 'MODERATE', description: 'Hierro reduce absorción de levotiroxina significativamente.', recommendation: 'Separar administración por al menos 4 horas.' },
  { drugA: 'calcio', drugB: 'levotiroxina', severity: 'MODERATE', description: 'Calcio reduce absorción de levotiroxina formando complejos insolubles.', recommendation: 'Separar por al menos 4 horas.' },

  // LOW severity
  { drugA: 'ibuprofeno', drugB: 'paracetamol', severity: 'LOW', description: 'Combinación generalmente segura por mecanismos complementarios. Efecto analgésico aditivo.', recommendation: 'Pueden usarse juntos. No exceder dosis máxima individual de cada uno.' },
  { drugA: 'omeprazol', drugB: 'hierro', severity: 'LOW', description: 'Omeprazol reduce absorción de hierro por aumento de pH gástrico.', recommendation: 'Considerar suplemento de vitamina C para mejorar absorción de hierro.' },
  { drugA: 'metformina', drugB: 'vitamina b12', severity: 'LOW', description: 'Uso prolongado de metformina puede reducir absorción de vitamina B12.', recommendation: 'Monitorear niveles de B12 anualmente en usuarios crónicos.' },
  { drugA: 'atorvastatina', drugB: 'jugo de pomelo', severity: 'LOW', description: 'Pomelo inhibe CYP3A4, puede aumentar niveles de atorvastatina moderadamente.', recommendation: 'Evitar consumo excesivo de pomelo.' },
  { drugA: 'amoxicilina', drugB: 'paracetamol', severity: 'LOW', description: 'Sin interacción significativa. Combinación segura y frecuente.', recommendation: 'Uso seguro en dosis terapéuticas.' },
];

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    if (user.role !== 'OWNER') {
      return NextResponse.json({ error: 'Sin permisos' }, { status: 403 });
    }

    const results = await prisma.$transaction(
      COMMON_INTERACTIONS.map(i =>
        prisma.drugInteraction.upsert({
          where: { drugA_drugB: { drugA: i.drugA, drugB: i.drugB } },
          create: {
            drugA: i.drugA,
            drugB: i.drugB,
            severity: i.severity as any,
            description: i.description,
            recommendation: i.recommendation,
          },
          update: {
            severity: i.severity as any,
            description: i.description,
            recommendation: i.recommendation,
          },
        })
      )
    );

    return NextResponse.json({
      message: `${results.length} interacciones farmacológicas cargadas`,
      breakdown: {
        HIGH: COMMON_INTERACTIONS.filter(i => i.severity === 'HIGH').length,
        MODERATE: COMMON_INTERACTIONS.filter(i => i.severity === 'MODERATE').length,
        LOW: COMMON_INTERACTIONS.filter(i => i.severity === 'LOW').length,
      },
    });
  } catch (error) {
    console.error('POST /api/drug-interactions/seed error:', error);
    return NextResponse.json({ error: 'Error al cargar interacciones' }, { status: 500 });
  }
}
