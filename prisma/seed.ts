import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding database...')

  // 1. Create Grades (разряды 1-8)
  const gradeRates = [120, 130, 140, 155, 170, 185, 200, 220]
  for (let i = 1; i <= 8; i++) {
    await prisma.grade.upsert({
      where: { number: i },
      update: {},
      create: {
        number: i,
        name: `${i} разряд`,
        hourlyRate: gradeRates[i - 1],
      },
    })
  }
  console.log('✅ Grades created')

  // 2. Create Shifts (смены 1-4)
  for (let i = 1; i <= 4; i++) {
    await prisma.shift.upsert({
      where: { number: i },
      update: {},
      create: {
        number: i,
        name: `Смена ${i}`,
      },
    })
  }
  console.log('✅ Shifts created')

  // 3. Create Equipment (оборудование)
  const equipmentData = [
    { name: 'Станок токарный Т-1', workshop: 'Цех №1', area: 'Участок А' },
    { name: 'Станок токарный Т-2', workshop: 'Цех №1', area: 'Участок А' },
    { name: 'Станок фрезерный Ф-1', workshop: 'Цех №1', area: 'Участок А' },
    { name: 'Станок фрезерный Ф-2', workshop: 'Цех №1', area: 'Участок Б' },
    { name: 'Станок сверлильный С-1', workshop: 'Цех №1', area: 'Участок Б' },
    { name: 'Пресс гидравлический П-1', workshop: 'Цех №1', area: 'Участок В' },
    { name: 'Пресс гидравлический П-2', workshop: 'Цех №1', area: 'Участок В' },
    { name: 'Станок шлифовальный Ш-1', workshop: 'Цех №1', area: 'Участок В' },
    { name: 'Сварочный аппарат СВ-1', workshop: 'Цех №1', area: 'Участок Г' },
    { name: 'Сварочный аппарат СВ-2', workshop: 'Цех №1', area: 'Участок Г' },
    { name: 'Кран мостовой К-1', workshop: 'Цех №1', area: 'Участок Д' },
    { name: 'Кран мостовой К-2', workshop: 'Цех №1', area: 'Участок Д' },
  ]
  for (const eq of equipmentData) {
    await prisma.equipment.upsert({
      where: { id: equipmentData.indexOf(eq) + 1 },
      update: {},
      create: eq,
    })
  }
  console.log('✅ Equipment created')

  // 4. Create Admin User
  const adminPassword = await bcrypt.hash('admin123', 10)
  const admin = await prisma.user.upsert({
    where: { email: 'admin@factory.ru' },
    update: {},
    create: {
      email: 'admin@factory.ru',
      password: adminPassword,
      name: 'Администратор',
      role: 'admin',
    },
  })
  console.log('✅ Admin user created')

  // 5. Create Master Users (one per shift)
  const masterNames = [
    { name: 'Петров Иван Сергеевич', email: 'master1@factory.ru' },
    { name: 'Сидоров Алексей Николаевич', email: 'master2@factory.ru' },
    { name: 'Козлов Дмитрий Викторович', email: 'master3@factory.ru' },
    { name: 'Новиков Сергей Александрович', email: 'master4@factory.ru' },
  ]
  const masterPassword = await bcrypt.hash('master123', 10)
  const masters = []
  for (let i = 0; i < 4; i++) {
    const master = await prisma.user.upsert({
      where: { email: masterNames[i].email },
      update: {},
      create: {
        email: masterNames[i].email,
        password: masterPassword,
        name: masterNames[i].name,
        role: 'master',
      },
    })
    masters.push(master)
    // Assign master to shift
    await prisma.shift.update({
      where: { number: i + 1 },
      data: { masterId: master.id },
    })
  }
  console.log('✅ Master users created and assigned to shifts')

  // 6. Create Brigadier Users
  const brigadierNames = [
    { name: 'Федоров Владимир Иванович', email: 'brig1@factory.ru' },
    { name: 'Морозов Андрей Петрович', email: 'brig2@factory.ru' },
    { name: 'Волков Павел Дмитриевич', email: 'brig3@factory.ru' },
    { name: 'Соловьёв Максим Игоревич', email: 'brig4@factory.ru' },
  ]
  const brigPassword = await bcrypt.hash('brig123', 10)
  for (const b of brigadierNames) {
    await prisma.user.upsert({
      where: { email: b.email },
      update: {},
      create: {
        email: b.email,
        password: brigPassword,
        name: b.name,
        role: 'brigadier',
      },
    })
  }
  console.log('✅ Brigadier users created')

  // 7. Create Workers (по ~5-6 на смену)
  const workerData = [
    // Смена 1
    { lastName: 'Иванов', firstName: 'Алексей', patronymic: 'Петрович', grade: 5, shift: 1, eq: 1 },
    { lastName: 'Смирнов', firstName: 'Дмитрий', patronymic: 'Олегович', grade: 4, shift: 1, eq: 2 },
    { lastName: 'Кузнецов', firstName: 'Сергей', patronymic: 'Викторович', grade: 6, shift: 1, eq: 3 },
    { lastName: 'Попов', firstName: 'Андрей', patronymic: 'Николаевич', grade: 3, shift: 1, eq: 4 },
    { lastName: 'Васильев', firstName: 'Максим', patronymic: 'Александрович', grade: 7, shift: 1, eq: 5 },
    // Смена 2
    { lastName: 'Михайлов', firstName: 'Евгений', patronymic: 'Сергеевич', grade: 6, shift: 2, eq: 6 },
    { lastName: 'Зайцев', firstName: 'Игорь', patronymic: 'Дмитриевич', grade: 5, shift: 2, eq: 7 },
    { lastName: 'Лебедев', firstName: 'Олег', patronymic: 'Андреевич', grade: 4, shift: 2, eq: 8 },
    { lastName: 'Соколов', firstName: 'Николай', patronymic: 'Васильевич', grade: 8, shift: 2, eq: 9 },
    { lastName: 'Яковлев', firstName: 'Виктор', patronymic: 'Иванович', grade: 3, shift: 2, eq: 10 },
    // Смена 3
    { lastName: 'Григорьев', firstName: 'Павел', patronymic: 'Евгеньевич', grade: 5, shift: 3, eq: 11 },
    { lastName: 'Романов', firstName: 'Артём', patronymic: 'Олегович', grade: 4, shift: 3, eq: 12 },
    { lastName: 'Захаров', firstName: 'Тимофей', patronymic: 'Сергеевич', grade: 6, shift: 3, eq: 1 },
    { lastName: 'Степанов', firstName: 'Денис', patronymic: 'Алексеевич', grade: 7, shift: 3, eq: 2 },
    { lastName: 'Белов', firstName: 'Константин', patronymic: 'Михайлович', grade: 3, shift: 3, eq: 3 },
    // Смена 4
    { lastName: 'Комаров', firstName: 'Руслан', patronymic: 'Петрович', grade: 8, shift: 4, eq: 4 },
    { lastName: 'Орлов', firstName: 'Вадим', patronymic: 'Николаевич', grade: 5, shift: 4, eq: 5 },
    { lastName: 'Киселёв', firstName: 'Григорий', patronymic: 'Андреевич', grade: 4, shift: 4, eq: 6 },
    { lastName: 'Макаров', firstName: 'Борис', patronymic: 'Викторович', grade: 6, shift: 4, eq: 7 },
    { lastName: 'Титов', firstName: 'Леонид', patronymic: 'Дмитриевич', grade: 2, shift: 4, eq: 8 },
  ]

  for (const w of workerData) {
    const worker = await prisma.worker.upsert({
      where: { lastName_firstName_patronymic: { lastName: w.lastName, firstName: w.firstName, patronymic: w.patronymic } },
      update: {},
      create: {
        lastName: w.lastName,
        firstName: w.firstName,
        patronymic: w.patronymic,
        gradeNumber: w.grade,
        shiftNumber: w.shift,
        equipmentId: w.eq,
        isActive: true,
      },
    })
  }
  console.log('✅ Workers created')

  // 8. Add some benefits and professions
  const workers = await prisma.worker.findMany()
  
  // Add benefits to some workers
  const benefitTypes = ['Вредные условия труда', 'Северная надбавка', 'Инвалидность 3 группы', 'Льготная пенсия']
  for (let i = 0; i < Math.min(6, workers.length); i++) {
    await prisma.workerBenefit.create({
      data: {
        workerId: workers[i].id,
        benefitType: benefitTypes[i % benefitTypes.length],
        description: `Льгота для ${workers[i].lastName}`,
      },
    })
  }

  // Add additional professions to some workers
  const additionalProfessions = ['Электросварщик', 'Стропальщик', 'Наладчик', 'Слесарь-ремонтник']
  for (let i = 0; i < Math.min(4, workers.length); i++) {
    await prisma.workerProfession.create({
      data: {
        workerId: workers[i].id,
        professionName: additionalProfessions[i],
      },
    })
  }
  console.log('✅ Benefits and professions added')

  // 9. Set schedule start date
  // Shift 1 starts with "Day" on 2026-01-01
  await prisma.scheduleConfig.upsert({
    where: { key: 'start_date' },
    update: { value: '2026-01-01' },
    create: { key: 'start_date', value: '2026-01-01' },
  })
  console.log('✅ Schedule config set')

  // 10. Add Russian holidays for 2026
  const holidays2026 = [
    { date: '2026-01-01', name: 'Новый год' },
    { date: '2026-01-02', name: 'Новогодние каникулы' },
    { date: '2026-01-03', name: 'Новогодние каникулы' },
    { date: '2026-01-04', name: 'Новогодние каникулы' },
    { date: '2026-01-05', name: 'Новогодние каникулы' },
    { date: '2026-01-06', name: 'Новогодние каникулы' },
    { date: '2026-01-07', name: 'Рождество Христово' },
    { date: '2026-01-08', name: 'Новогодние каникулы' },
    { date: '2026-02-23', name: 'День защитника Отечества' },
    { date: '2026-03-08', name: 'Международный женский день' },
    { date: '2026-03-09', name: 'Перенос выходного (8 марта)' },
    { date: '2026-05-01', name: 'Праздник Весны и Труда' },
    { date: '2026-05-09', name: 'День Победы' },
    { date: '2026-05-11', name: 'Перенос выходного (9 мая)' },
    { date: '2026-06-12', name: 'День России' },
    { date: '2026-11-04', name: 'День народного единства' },
  ]
  for (const h of holidays2026) {
    await prisma.holiday.upsert({
      where: { date: h.date },
      update: {},
      create: h,
    })
  }
  console.log('✅ Holidays added')

  console.log('🎉 Seeding complete!')
  console.log('')
  console.log('📋 Login credentials:')
  console.log('  Admin:    admin@factory.ru / admin123')
  console.log('  Master 1: master1@factory.ru / master123')
  console.log('  Master 2: master2@factory.ru / master123')
  console.log('  Master 3: master3@factory.ru / master123')
  console.log('  Master 4: master4@factory.ru / master123')
  console.log('  Brigadier: brig1@factory.ru / brig123')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
