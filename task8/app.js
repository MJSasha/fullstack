// URLs для получения данных
const BITCOIN_USD_URL = 'https://luky3.jinr.ru/bitcoin.json';
const FALLBACK_BITCOIN_USD_URL = 'https://api.blockchain.info/stats'; // Запасной URL
const USD_RUB_URL = 'https://www.cbr-xml-daily.ru/daily_json.js';

// Константы для кэширования курса USD/RUB (1 час в миллисекундах)
const CACHE_KEY = 'usdRubRateCache';
const CACHE_DURATION = 60 * 60 * 1000; // 1 час

let previousTotalRubValue = null; // Для хранения предыдущего значения стоимости сделок в РУБ
let isFetching = false; // Флаг для предотвращения параллельных запросов

/**
 * Получает курс USD к RUB, используя кэширование в localStorage на 1 час.
 * @returns {Promise<number>} Курс USD к RUB.
 */
async function getUsdRubRate() {
  const cachedData = localStorage.getItem(CACHE_KEY);
  const now = new Date().getTime();

  // 1. Проверка кэша
  if (cachedData) {
    const { rate, timestamp } = JSON.parse(cachedData);
    if (now - timestamp < CACHE_DURATION) {
      console.log('Используется кэшированный курс USD/RUB');
      return rate;
    }
  }

  // 2. Получение новых данных
  try {
    const response = await fetch(USD_RUB_URL);
    const data = await response.json();
    const usdRate = data.Valute.USD.Value;

    // 3. Кэширование нового значения
    const newCache = {
      rate: usdRate,
      timestamp: now
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(newCache));
    console.log('Курс USD/RUB обновлен и кэширован.');
    return usdRate;

  } catch (error) {
    console.error('Ошибка при получении курса USD/RUB:', error);
    // Если не удалось получить новый курс, но есть старый в кэше, используем его.
    if (cachedData) {
      console.log('Ошибка получения курса, используется старый кэшированный курс.');
      return JSON.parse(cachedData).rate;
    }
    // В крайнем случае, возвращаем курс по умолчанию, чтобы приложение не падало
    return 90; // Стандартное значение, если совсем нет данных
  }
}

/**
 * Получает данные о Bitcoin с основного или запасного URL.
 * @returns {Promise<object>} Объект с данными о Bitcoin.
 */
async function getBitcoinData() {
  // Пробуем основной URL
  try {
    const response = await fetch(BITCOIN_USD_URL);
    if (response.status === 502) {
      throw new Error('Получена ошибка 502 (Bad Gateway)');
    }
    const data = await response.json();
    console.log('Данные Bitcoin получены с основного URL.');
    // Структура данных зависит от URL, здесь предполагаем, что он содержит цену и объем.
    // Для примера используем свойства, которые можно найти в данных:
    return {
      priceUsd: data.last, // Рыночная цена в USD (или другое поле, в зависимости от реального API)
      volumeBtc: data.total_fees // Объем сделок в BTC (или другое поле)
    };
  } catch (e) {
    console.warn(`Основной URL не работает: ${e.message}. Используем запасной URL.`);

    // Пробуем запасной URL
    try {
      const response = await fetch(FALLBACK_BITCOIN_USD_URL);
      const data = await response.json();
      console.log('Данные Bitcoin получены с запасного URL.');
      // Адаптируем под структуру запасного API (api.blockchain.info/stats)
      return {
        priceUsd: data.market_price_usd, // Рыночная цена в USD
        volumeBtc: data.trade_volume_btc // Объем сделок в BTC
      };
    } catch (error) {
      console.error('Ошибка при получении данных Bitcoin с запасного URL:', error);
      throw new Error('Не удалось получить данные о Bitcoin.');
    }
  }
}

/**
 * Форматирует число в валютный формат RUB.
 * @param {number} value Число для форматирования.
 * @returns {string} Отформатированная строка.
 */
function formatRub(value) {
  const numberValue = (typeof value === 'number' && !isNaN(value)) ? value : 0;

  return numberValue.toLocaleString('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

/**
 * Форматирует объем BTC.
 * @param {number} value Число для форматирования.
 * @returns {string} Отформатированная строка.
 */
function formatBtc(value) {
  const numberValue = (typeof value === 'number' && !isNaN(value)) ? value : 0;

  return numberValue.toLocaleString('ru-RU', {
    minimumFractionDigits: 4,
    maximumFractionDigits: 8
  });
}


/**
 * Обновляет таблицу с данными.
 */
async function updateCryptoTable() {
  if (isFetching) {
    console.log('Предыдущий запрос еще выполняется. Пропускаем текущее обновление.');
    return;
  }

  isFetching = true;
  const tbody = document.getElementById('crypto-table-body');
  const updateTimeElement = document.getElementById('last-update');

  // Предварительное сообщение о загрузке
  tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">Обновление данных...</td></tr>';

  try {
    // 1. Получение курсов
    const [usdRubRate, btcData] = await Promise.all([
      getUsdRubRate(),
      getBitcoinData()
    ]);

    const { priceUsd, volumeBtc } = btcData;

    // 2. Расчеты в RUB
    const marketPriceRub = priceUsd * usdRubRate;
    const totalRubValue = marketPriceRub * volumeBtc; // Стоимость сделок в РУБ

    // 3. Расчет изменения стоимости сделок
    let changeRubValue = 0;
    let changeClass = 'zero';

    if (previousTotalRubValue !== null) {
      changeRubValue = totalRubValue - previousTotalRubValue;

      if (changeRubValue > 0) {
        changeClass = 'positive';
      } else if (changeRubValue < 0) {
        changeClass = 'negative';
      }
    }

    // 4. Обновление предыдущего значения для следующего цикла
    previousTotalRubValue = totalRubValue;

    // 5. Форматирование и отображение
    const changeSign = changeRubValue > 0 ? '+' : '';
    const changeText = `${changeSign}${formatRub(changeRubValue)}`;

    tbody.innerHTML = `
            <tr>
                <td>${formatRub(marketPriceRub)} ₽</td>
                <td>${formatBtc(volumeBtc)} BTC</td>
                <td>${formatRub(totalRubValue)} ₽</td>
                <td class="${changeClass}">
                    ${changeText} ₽
                </td>
            </tr>
        `;

    updateTimeElement.textContent = `Последнее обновление: ${new Date().toLocaleTimeString()} (Обновляется раз в минуту. Курс USD/RUB кэшируется на 1 час.)`;

  } catch (error) {
    console.error('Критическая ошибка обновления:', error);
    tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: red;">Ошибка: ${error.message}</td></tr>`;
    updateTimeElement.textContent = `Ошибка обновления: ${new Date().toLocaleTimeString()}`;
  } finally {
    isFetching = false;
  }
}

// 6. Запуск и автоматическое обновление
document.addEventListener('DOMContentLoaded', () => {
  // Первый запуск
  updateCryptoTable();

  // Автоматическое обновление раз в минуту (60000 миллисекунд)
  setInterval(updateCryptoTable, 60000);
});
