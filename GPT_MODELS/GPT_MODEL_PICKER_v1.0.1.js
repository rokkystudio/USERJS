// GPT_MODEL_PICKER_v1.0.4.js
(() => {
    'use strict';

    const GLOBAL_KEY = '__gptModelPicker';

    if (window[GLOBAL_KEY] && typeof window[GLOBAL_KEY].stop === 'function') {
        window[GLOBAL_KEY].stop();
    }

    const config = {
        /** URL backend-метода со списком моделей режима Work. */
        workModelsUrl: '/backend-api/tpp/models/?supports_model_picker_upgrade_presets=true',

        /** URL backend-метода со списком моделей обычного ChatGPT. */
        chatModelsUrl: '/backend-api/models?iim=false&is_gizmo=false&supports_model_picker_upgrade_presets=true',

        /** Путь запроса создания нового хода разговора. */
        conversationPath: '/backend-api/f/conversation',

        /** Ключ выбранной модели в localStorage. */
        storageKey: 'gpt-model-picker.selected-model.v2',

        /** Ключ позиции панели в localStorage. */
        positionStorageKey: 'gpt-model-picker.position.v1',

        /** Ключ состояния свёрнутой панели в localStorage. */
        collapsedStorageKey: 'gpt-model-picker.collapsed.v1',

        /** Период проверки состояния перехватчика window.fetch. */
        hookCheckIntervalMs: 1000,

        /** Включает диагностические сообщения в консоли браузера. */
        debug: true
    };

    const state = {
        baseFetch: window.fetch,
        downstreamFetch: window.fetch,
        originalFetchDescriptor: Object.getOwnPropertyDescriptor(window, 'fetch'),
        fetchGuardInstalled: false,
        downstreamReplacementCount: 0,
        bypassDownstream: false,
        selectedModelSlug: '',
        workModels: [],
        chatModels: [],
        workDefaultModelSlug: '',
        panel: null,
        header: null,
        collapseButton: null,
        select: null,
        input: null,
        hookStatus: null,
        catalogStatus: null,
        selectedStatus: null,
        requestStatus: null,
        backendStatus: null,
        hookTimer: null,
        dragState: null,
        collapsed: false,
        lastRequestedModelSlug: '',
        lastResolvedModelSlug: '',
        stopped: false
    };

    /**
     * Выводит диагностическое сообщение с префиксом скрипта.
     *
     * @param {...any} args
     */
    function log(...args) {
        if (config.debug) {
            console.debug('[GPT MODEL PICKER]', ...args);
        }
    }

    /**
     * Возвращает путь запроса без origin и query-параметров.
     *
     * @param {RequestInfo | URL} input
     * @returns {string}
     */
    function getRequestPath(input) {
        const rawUrl = input instanceof Request ? input.url : String(input);

        return new URL(rawUrl, window.location.origin).pathname;
    }

    /**
     * Вызывает текущую штатную обёртку fetch и исключает повторный вход, если
     * эта обёртка ранее получила защищённый fetch как нижний слой.
     *
     * @param {RequestInfo | URL} input
     * @param {RequestInit | undefined} init
     * @returns {Promise<Response>}
     */
    async function callDownstreamFetch(input, init) {
        if (state.bypassDownstream) {
            return state.baseFetch.call(window, input, init);
        }

        state.bypassDownstream = true;

        try {
            return await state.downstreamFetch.call(window, input, init);
        } finally {
            state.bypassDownstream = false;
        }
    }

    /**
     * Возвращает JSON-тело запроса и функцию создания запроса с новым телом.
     *
     * @param {RequestInfo | URL} input
     * @param {RequestInit | undefined} init
     * @returns {Promise<{ body: string, rebuild: (body: string) => Request | [RequestInfo | URL, RequestInit] } | null>}
     */
    async function readRequestBody(input, init) {
        if (init && typeof init.body === 'string') {
            return {
                body: init.body,
                rebuild(body) {
                    return [input, { ...init, body }];
                }
            };
        }

        if (input instanceof Request) {
            return {
                body: await input.clone().text(),
                rebuild(body) {
                    return new Request(input, { body });
                }
            };
        }

        return null;
    }

    /**
     * Подставляет выбранный slug в поля модели JSON payload.
     *
     * Поле model всегда содержит выбранный slug. Поля model_slug и
     * requested_model_slug получают тот же slug только при наличии в исходном
     * payload, чтобы не добавлять неизвестные backend-поля.
     *
     * @param {string} body
     * @returns {{ body: string, originalModelSlug: string } | null}
     */
    function replaceModelInBody(body) {
        if (!state.selectedModelSlug || !body) {
            return null;
        }

        let payload;

        try {
            payload = JSON.parse(body);
        } catch {
            return null;
        }

        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
            return null;
        }

        const originalModelSlug = String(
            payload.model || payload.model_slug || payload.requested_model_slug || ''
        );

        payload.model = state.selectedModelSlug;

        if (Object.prototype.hasOwnProperty.call(payload, 'model_slug')) {
            payload.model_slug = state.selectedModelSlug;
        }

        if (Object.prototype.hasOwnProperty.call(payload, 'requested_model_slug')) {
            payload.requested_model_slug = state.selectedModelSlug;
        }

        return {
            body: JSON.stringify(payload),
            originalModelSlug
        };
    }

    /**
     * Добавляет точное значение slug в массив без повторений.
     *
     * @param {string[]} target
     * @param {unknown} value
     */
    function appendModelSlug(target, value) {
        if (typeof value === 'string' && value && !target.includes(value)) {
            target.push(value);
        }
    }

    /**
     * Собирает поля model_slug и resolved_model_slug из JSON-объекта ответа.
     *
     * @param {unknown} value
     * @param {{ resolved: string[], assistant: string[], all: string[] }} result
     */
    function collectResponseModelSlugs(value, result) {
        if (!value || typeof value !== 'object') {
            return;
        }

        if (Array.isArray(value)) {
            for (const item of value) {
                collectResponseModelSlugs(item, result);
            }

            return;
        }

        appendModelSlug(result.resolved, value.resolved_model_slug);
        appendModelSlug(result.all, value.model_slug);

        if (value.author?.role === 'assistant' && value.metadata) {
            appendModelSlug(result.resolved, value.metadata.resolved_model_slug);
            appendModelSlug(result.assistant, value.metadata.model_slug);
        }

        for (const nestedValue of Object.values(value)) {
            collectResponseModelSlugs(nestedValue, result);
        }
    }

    /**
     * Возвращает модель, указанную backend-событиями потока ответа.
     *
     * @param {string} responseText
     * @returns {string}
     */
    function extractResolvedModelSlug(responseText) {
        const result = {
            resolved: [],
            assistant: [],
            all: []
        };

        for (const line of responseText.split(/\r?\n/)) {
            const trimmedLine = line.trim();

            if (!trimmedLine || trimmedLine === 'data: [DONE]') {
                continue;
            }

            const jsonText = trimmedLine.startsWith('data:')
                ? trimmedLine.slice(5).trim()
                : trimmedLine;

            if (!jsonText.startsWith('{') && !jsonText.startsWith('[')) {
                continue;
            }

            try {
                collectResponseModelSlugs(JSON.parse(jsonText), result);
            } catch {
                continue;
            }
        }

        return result.resolved.at(-1) || result.assistant.at(-1) || result.all.at(-1) || '';
    }

    /**
     * Отображает совпадение запрошенной модели с моделью backend.
     *
     * @param {string} requestedModelSlug
     * @param {string} resolvedModelSlug
     */
    function displayResolvedModelStatus(requestedModelSlug, resolvedModelSlug) {
        state.lastResolvedModelSlug = resolvedModelSlug;

        const matchesRequest = resolvedModelSlug === requestedModelSlug;
        updateBackendStatus(
            matchesRequest
                ? `Backend \u043f\u0440\u0438\u043d\u044f\u043b: ${resolvedModelSlug}`
                : `Backend \u0437\u0430\u043c\u0435\u043d\u0438\u043b: ${requestedModelSlug} \u2192 ${resolvedModelSlug}`,
            matchesRequest ? 'success' : 'warning'
        );
    }

    /**
     * Читает копию потокового ответа и отображает модель, принятую backend.
     *
     * @param {Response} response
     * @param {string} requestedModelSlug
     */
    async function observeConversationResponse(response, requestedModelSlug) {
        if (!response.ok) {
            updateBackendStatus(`Backend: HTTP ${response.status}; \u0437\u0430\u043f\u0440\u043e\u0448\u0435\u043d\u0430 ${requestedModelSlug}`, 'error');
            return;
        }

        const responseBody = response.clone().body;

        if (!responseBody) {
            updateBackendStatus('Backend: \u043e\u0442\u0432\u0435\u0442 200 \u0431\u0435\u0437 \u043f\u043e\u0442\u043e\u043a\u0430 \u0434\u0430\u043d\u043d\u044b\u0445', 'warning');
            return;
        }

        const reader = responseBody.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let resolvedModelSlug = '';

        try {
            while (true) {
                const { value, done } = await reader.read();
                buffer += decoder.decode(value || new Uint8Array(), { stream: !done });

                const lines = buffer.split(/\r?\n/);
                buffer = done ? '' : lines.pop() || '';

                const currentModelSlug = extractResolvedModelSlug(lines.join('\n'));

                if (currentModelSlug) {
                    resolvedModelSlug = currentModelSlug;
                    displayResolvedModelStatus(requestedModelSlug, resolvedModelSlug);
                }

                if (done) {
                    break;
                }
            }

            if (!resolvedModelSlug && buffer) {
                resolvedModelSlug = extractResolvedModelSlug(buffer);
            }

            if (resolvedModelSlug) {
                displayResolvedModelStatus(requestedModelSlug, resolvedModelSlug);
            } else {
                updateBackendStatus('Backend: \u043e\u0442\u0432\u0435\u0442 200, model_slug \u0432 \u043f\u043e\u0442\u043e\u043a\u0435 \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d', 'warning');
            }
        } catch (error) {
            if (resolvedModelSlug) {
                displayResolvedModelStatus(requestedModelSlug, resolvedModelSlug);
                log('response stream closed after model detection', error);
            } else if (error?.name === 'AbortError' || /aborted/i.test(String(error?.message || ''))) {
                updateBackendStatus('Backend: \u043f\u043e\u0442\u043e\u043a \u0437\u0430\u043a\u0440\u044b\u0442 ChatGPT; model_slug \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d', 'warning');
                log('response stream aborted before model detection', error);
            } else {
                updateBackendStatus(`Backend: \u043e\u0448\u0438\u0431\u043a\u0430 \u0447\u0442\u0435\u043d\u0438\u044f \u043e\u0442\u0432\u0435\u0442\u0430: ${error.message}`, 'error');
                log('response inspection failed', error);
            }
        } finally {
            reader.releaseLock();
        }
    }

    /**
     * Перехватывает запрос создания хода, подставляет модель и наблюдает ответ.
     *
     * @param {RequestInfo | URL} input
     * @param {RequestInit | undefined} init
     * @returns {Promise<Response>}
     */
    async function fetchWithSelectedModel(input, init) {
        if (state.bypassDownstream) {
            return state.baseFetch.call(window, input, init);
        }

        if (state.stopped || getRequestPath(input) !== config.conversationPath) {
            return callDownstreamFetch(input, init);
        }

        const requestBody = await readRequestBody(input, init);
        const replacement = requestBody && replaceModelInBody(requestBody.body);

        if (!requestBody || !replacement) {
            updateRequestStatus('\u0417\u0430\u043f\u0440\u043e\u0441: JSON payload \u043d\u0435 \u043f\u0435\u0440\u0435\u0445\u0432\u0430\u0447\u0435\u043d', 'error');
            return callDownstreamFetch(input, init);
        }

        const requestedModelSlug = state.selectedModelSlug;
        const rebuilt = requestBody.rebuild(replacement.body);

        state.lastRequestedModelSlug = requestedModelSlug;
        state.lastResolvedModelSlug = '';
        updateRequestStatus(
            replacement.originalModelSlug && replacement.originalModelSlug !== requestedModelSlug
                ? `\u0417\u0430\u043f\u0440\u043e\u0441: ${replacement.originalModelSlug} \u2192 ${requestedModelSlug}`
                : `\u0417\u0430\u043f\u0440\u043e\u0441: ${requestedModelSlug}`,
            'success'
        );
        updateBackendStatus('Backend: \u043e\u0436\u0438\u0434\u0430\u043d\u0438\u0435 \u043e\u0442\u0432\u0435\u0442\u0430\u2026', 'neutral');
        log('request model replaced', {
            originalModelSlug: replacement.originalModelSlug,
            requestedModelSlug
        });

        const response = Array.isArray(rebuilt)
            ? await callDownstreamFetch(rebuilt[0], rebuilt[1])
            : await callDownstreamFetch(rebuilt);

        observeConversationResponse(response, requestedModelSlug);

        return response;
    }

    /**
     * Создает DOM-элемент с атрибутами и текстом.
     *
     * @param {string} tagName
     * @param {Record<string, string>} attributes
     * @param {string} [text]
     * @returns {HTMLElement}
     */
    function createElement(tagName, attributes, text) {
        const element = document.createElement(tagName);

        for (const [name, value] of Object.entries(attributes)) {
            element.setAttribute(name, value);
        }

        if (text !== undefined) {
            element.textContent = text;
        }

        return element;
    }

    /**
     * Записывает текст и визуальный тип строки состояния.
     *
     * @param {HTMLElement | null} element
     * @param {string} message
     * @param {'neutral' | 'success' | 'warning' | 'error'} type
     */
    function setStatus(element, message, type) {
        if (element) {
            element.textContent = message;
            element.dataset.statusType = type;
        }
    }

    /** Возвращает защищённый перехватчик при чтении window.fetch. */
    function getGuardedFetch() {
        return fetchWithSelectedModel;
    }

    /**
     * Принимает новую штатную обёртку fetch как нижний слой перехватчика.
     *
     * @param {Function} value
     */
    function setGuardedFetch(value) {
        if (typeof value === 'function' && value !== fetchWithSelectedModel) {
            state.downstreamFetch = value;
            state.downstreamReplacementCount += 1;
            log('downstream fetch replaced', state.downstreamReplacementCount);
        }

        updateHookStatus();
    }

    /** Устанавливает accessor, сохраняющий перехватчик поверх штатных обёрток. */
    function installFetchGuard() {
        Object.defineProperty(window, 'fetch', {
            configurable: true,
            enumerable: state.originalFetchDescriptor?.enumerable ?? true,
            get: getGuardedFetch,
            set: setGuardedFetch
        });
        state.fetchGuardInstalled = true;
        updateHookStatus();
    }

    /** Обновляет состояние защищённого перехватчика window.fetch. */
    function updateHookStatus() {
        const descriptor = Object.getOwnPropertyDescriptor(window, 'fetch');
        const isActive = descriptor?.get === getGuardedFetch && descriptor?.set === setGuardedFetch;

        setStatus(
            state.hookStatus,
            isActive
                ? `\u041f\u0435\u0440\u0435\u0445\u0432\u0430\u0442 fetch: \u0437\u0430\u0449\u0438\u0449\u0451\u043d; \u0448\u0442\u0430\u0442\u043d\u044b\u0445 \u0437\u0430\u043c\u0435\u043d ${state.downstreamReplacementCount}`
                : '\u041f\u0435\u0440\u0435\u0445\u0432\u0430\u0442 fetch: \u0437\u0430\u0449\u0438\u0442\u0430 \u043d\u0435\u0430\u043a\u0442\u0438\u0432\u043d\u0430',
            isActive ? 'success' : 'error'
        );
    }

    /**
     * Обновляет строку последнего исходящего запроса.
     *
     * @param {string} message
     * @param {'neutral' | 'success' | 'warning' | 'error'} type
     */
    function updateRequestStatus(message, type) {
        setStatus(state.requestStatus, message, type);
    }

    /**
     * Обновляет строку результата backend.
     *
     * @param {string} message
     * @param {'neutral' | 'success' | 'warning' | 'error'} type
     */
    function updateBackendStatus(message, type) {
        setStatus(state.backendStatus, message, type);
    }

    /**
     * Устанавливает модель и сохраняет ее идентификатор.
     *
     * @param {string} modelSlug
     * @param {boolean} persist
     */
    function setSelectedModel(modelSlug, persist) {
        const normalizedSlug = String(modelSlug || '').trim();

        if (!normalizedSlug) {
            return;
        }

        state.selectedModelSlug = normalizedSlug;

        if (persist) {
            localStorage.setItem(config.storageKey, normalizedSlug);
        }

        if (state.select) {
            state.select.value = normalizedSlug;
        }

        if (state.input) {
            state.input.value = normalizedSlug;
        }

        setStatus(state.selectedStatus, `\u0412\u044b\u0431\u0440\u0430\u043d\u0430: ${normalizedSlug}`, 'success');
    }

    /**
     * Добавляет модели одной группы в select.
     *
     * @param {HTMLSelectElement} select
     * @param {string} label
     * @param {Array<{ slug?: string, title?: string }>} models
     */
    function appendModelGroup(select, label, models) {
        const group = createElement('optgroup', { label });

        for (const model of models) {
            if (!model.slug) {
                continue;
            }

            const option = createElement('option', { value: model.slug });
            option.textContent = `${model.title || model.slug} \u2014 ${model.slug}`;
            group.append(option);
        }

        if (group.children.length > 0) {
            select.append(group);
        }
    }

    /** Заполняет список Work-моделями, обычными моделями и ручным slug. */
    function renderModels() {
        if (!state.select) {
            return;
        }

        state.select.replaceChildren();
        appendModelGroup(state.select, '\u041c\u043e\u0434\u0435\u043b\u0438 Work / TPP', state.workModels);
        appendModelGroup(state.select, '\u041e\u0431\u044b\u0447\u043d\u044b\u0439 ChatGPT', state.chatModels);

        const allModels = [...state.workModels, ...state.chatModels];

        if (state.selectedModelSlug && !allModels.some((model) => model.slug === state.selectedModelSlug)) {
            const group = createElement('optgroup', { label: '\u0420\u0443\u0447\u043d\u043e\u0439 slug' });
            group.append(createElement('option', { value: state.selectedModelSlug }, `${state.selectedModelSlug} \u2014 \u0432\u0440\u0443\u0447\u043d\u0443\u044e`));
            state.select.append(group);
        }

        state.select.value = state.selectedModelSlug;
    }

    /**
     * Возвращает bearer-токен текущей сессии ChatGPT.
     *
     * Значение используется только в памяти для запроса TPP-каталога и не
     * записывается в DOM, console или localStorage.
     *
     * @returns {Promise<string>}
     */
    async function loadSessionAccessToken() {
        const response = await state.baseFetch.call(window, '/api/auth/session', {
            credentials: 'include',
            headers: {
                Accept: 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`/api/auth/session: HTTP ${response.status}`);
        }

        const session = await response.json();
        const accessToken = session?.accessToken;

        if (typeof accessToken !== 'string' || !accessToken) {
            throw new Error('/api/auth/session: accessToken отсутствует');
        }

        return accessToken;
    }

    /**
     * Загружает и возвращает JSON backend-метода.
     *
     * @param {string} url
     * @returns {Promise<Record<string, any>>}
     */
    async function loadJson(url) {
        let response = await state.baseFetch.call(window, url, {
            credentials: 'include'
        });

        if (url === config.workModelsUrl && response.status === 404) {
            const accessToken = await loadSessionAccessToken();

            response = await state.baseFetch.call(window, url, {
                credentials: 'include',
                headers: {
                    Accept: 'application/json',
                    Authorization: `Bearer ${accessToken}`
                }
            });
        }

        if (!response.ok) {
            throw new Error(`${url}: HTTP ${response.status}`);
        }

        return response.json();
    }

    /** Загружает отдельные каталоги Work и обычного ChatGPT. */
    async function loadModels() {
        setStatus(state.catalogStatus, '\u041a\u0430\u0442\u0430\u043b\u043e\u0433\u0438: \u0437\u0430\u0433\u0440\u0443\u0437\u043a\u0430\u2026', 'neutral');

        const [workResult, chatResult] = await Promise.allSettled([
            loadJson(config.workModelsUrl),
            loadJson(config.chatModelsUrl)
        ]);
        const errors = [];

        if (workResult.status === 'fulfilled') {
            state.workModels = Array.isArray(workResult.value.models) ? workResult.value.models : [];
            state.workDefaultModelSlug = String(workResult.value.default_model_slug || '');
        } else {
            state.workModels = [];
            errors.push(workResult.reason.message);
        }

        if (chatResult.status === 'fulfilled') {
            state.chatModels = Array.isArray(chatResult.value.models) ? chatResult.value.models : [];
        } else {
            state.chatModels = [];
            errors.push(chatResult.reason.message);
        }

        if (!state.selectedModelSlug) {
            const storedModelSlug = localStorage.getItem(config.storageKey);
            setSelectedModel(
                storedModelSlug
                || state.workDefaultModelSlug
                || state.workModels[0]?.slug
                || state.chatModels[0]?.slug,
                false
            );
        }

        renderModels();

        if (errors.length > 0) {
            setStatus(state.catalogStatus, `\u041a\u0430\u0442\u0430\u043b\u043e\u0433\u0438: ${errors.join('; ')}`, 'error');
        } else {
            setStatus(state.catalogStatus, `\u041a\u0430\u0442\u0430\u043b\u043e\u0433\u0438: Work ${state.workModels.length}; ChatGPT ${state.chatModels.length}`, 'success');
        }

        log('model catalogs loaded', {
            workModels: state.workModels,
            chatModels: state.chatModels,
            workDefaultModelSlug: state.workDefaultModelSlug
        });
    }

    /** Возвращает защитный accessor после его удаления сторонним JavaScript. */
    function restoreHook() {
        const descriptor = Object.getOwnPropertyDescriptor(window, 'fetch');

        if (descriptor?.get !== getGuardedFetch || descriptor?.set !== setGuardedFetch) {
            const currentFetch = window.fetch;

            if (typeof currentFetch === 'function' && currentFetch !== fetchWithSelectedModel) {
                state.downstreamFetch = currentFetch;
            }

            installFetchGuard();
        }

        updateHookStatus();
    }

    /**
     * Ограничивает координаты панели видимой областью окна.
     *
     * @param {number} left
     * @param {number} top
     * @returns {{ left: number, top: number }}
     */
    function clampPanelPosition(left, top) {
        const rect = state.panel.getBoundingClientRect();
        const maxLeft = Math.max(0, window.innerWidth - rect.width);
        const maxTop = Math.max(0, window.innerHeight - rect.height);

        return {
            left: Math.min(Math.max(0, left), maxLeft),
            top: Math.min(Math.max(0, top), maxTop)
        };
    }

    /**
     * Устанавливает фиксированную позицию панели.
     *
     * @param {number} left
     * @param {number} top
     */
    function setPanelPosition(left, top) {
        const position = clampPanelPosition(left, top);

        state.panel.style.left = `${position.left}px`;
        state.panel.style.top = `${position.top}px`;
        state.panel.style.right = 'auto';
        state.panel.style.bottom = 'auto';
    }

    /** Сохраняет текущую позицию панели в localStorage. */
    function savePanelPosition() {
        const rect = state.panel.getBoundingClientRect();

        localStorage.setItem(config.positionStorageKey, JSON.stringify({
            left: rect.left,
            top: rect.top
        }));
    }

    /** Восстанавливает сохранённую позицию панели. */
    function restorePanelPosition() {
        const storedPosition = localStorage.getItem(config.positionStorageKey);

        if (!storedPosition) {
            return;
        }

        try {
            const position = JSON.parse(storedPosition);

            if (Number.isFinite(position?.left) && Number.isFinite(position?.top)) {
                setPanelPosition(position.left, position.top);
            }
        } catch (error) {
            log('stored panel position is invalid', error);
        }
    }

    /**
     * Сворачивает или разворачивает панель и сохраняет состояние.
     *
     * @param {boolean} collapsed
     * @param {boolean} persist
     */
    function setPanelCollapsed(collapsed, persist) {
        state.collapsed = collapsed;
        state.panel.classList.toggle('is-collapsed', collapsed);
        state.collapseButton.textContent = collapsed ? '+' : '\u2212';
        state.collapseButton.setAttribute('aria-label', collapsed ? '\u0420\u0430\u0437\u0432\u0435\u0440\u043d\u0443\u0442\u044c \u043f\u0430\u043d\u0435\u043b\u044c' : '\u0421\u0432\u0435\u0440\u043d\u0443\u0442\u044c \u043f\u0430\u043d\u0435\u043b\u044c');
        state.collapseButton.setAttribute('aria-expanded', String(!collapsed));

        if (persist) {
            localStorage.setItem(config.collapsedStorageKey, String(collapsed));
        }

        const rect = state.panel.getBoundingClientRect();
        setPanelPosition(rect.left, rect.top);
    }

    /** Начинает перемещение панели за шапку. */
    function handleHeaderPointerDown(event) {
        if (event.button !== 0 || event.target.closest('button')) {
            return;
        }

        const rect = state.panel.getBoundingClientRect();

        state.dragState = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            startLeft: rect.left,
            startTop: rect.top
        };
        state.header.classList.add('is-dragging');
        state.header.setPointerCapture(event.pointerId);
        event.preventDefault();
    }

    /** Перемещает панель вслед за активным указателем. */
    function handleHeaderPointerMove(event) {
        if (!state.dragState || state.dragState.pointerId !== event.pointerId) {
            return;
        }

        setPanelPosition(
            state.dragState.startLeft + event.clientX - state.dragState.startX,
            state.dragState.startTop + event.clientY - state.dragState.startY
        );
    }

    /** Завершает перемещение панели и сохраняет позицию. */
    function handleHeaderPointerUp(event) {
        if (!state.dragState || state.dragState.pointerId !== event.pointerId) {
            return;
        }

        state.header.classList.remove('is-dragging');

        if (state.header.hasPointerCapture(event.pointerId)) {
            state.header.releasePointerCapture(event.pointerId);
        }

        state.dragState = null;
        savePanelPosition();
    }

    /** Возвращает панель в видимую область после изменения размера окна. */
    function handleWindowResize() {
        if (!state.panel) {
            return;
        }

        const rect = state.panel.getBoundingClientRect();
        setPanelPosition(rect.left, rect.top);
        savePanelPosition();
    }

    /** Добавляет панель выбора и диагностики модели на страницу. */
    function createPanel() {
        const panel = createElement('section', {
            id: 'gpt-model-picker-panel',
            role: 'dialog',
            'aria-label': '\u0412\u044b\u0431\u043e\u0440 \u0438 \u043a\u043e\u043d\u0442\u0440\u043e\u043b\u044c \u043c\u043e\u0434\u0435\u043b\u0438 ChatGPT'
        });
        const header = createElement('div', { class: 'gpt-model-picker-header' });
        const title = createElement('div', { class: 'gpt-model-picker-title' }, '\u041c\u043e\u0434\u0435\u043b\u044c ChatGPT');
        const collapseButton = createElement('button', {
            class: 'gpt-model-picker-collapse',
            type: 'button',
            'aria-label': '\u0421\u0432\u0435\u0440\u043d\u0443\u0442\u044c \u043f\u0430\u043d\u0435\u043b\u044c',
            'aria-expanded': 'true'
        }, '\u2212');
        const select = createElement('select', {
            class: 'gpt-model-picker-select',
            'aria-label': '\u041c\u043e\u0434\u0435\u043b\u044c ChatGPT'
        });
        const input = createElement('input', {
            class: 'gpt-model-picker-input',
            type: 'text',
            placeholder: 'model_slug \u0432\u0440\u0443\u0447\u043d\u0443\u044e',
            'aria-label': '\u0418\u0434\u0435\u043d\u0442\u0438\u0444\u0438\u043a\u0430\u0442\u043e\u0440 \u043c\u043e\u0434\u0435\u043b\u0438 \u0432\u0440\u0443\u0447\u043d\u0443\u044e'
        });
        const buttons = createElement('div', { class: 'gpt-model-picker-buttons' });
        const applyButton = createElement('button', { class: 'gpt-model-picker-button', type: 'button' }, '\u041f\u0440\u0438\u043c\u0435\u043d\u0438\u0442\u044c slug');
        const reloadButton = createElement('button', { class: 'gpt-model-picker-button', type: 'button' }, '\u041e\u0431\u043d\u043e\u0432\u0438\u0442\u044c \u043a\u0430\u0442\u0430\u043b\u043e\u0433\u0438');
        const restoreButton = createElement('button', { class: 'gpt-model-picker-button', type: 'button' }, '\u0412\u0435\u0440\u043d\u0443\u0442\u044c \u043f\u0435\u0440\u0435\u0445\u0432\u0430\u0442');
        const diagnostics = createElement('div', { class: 'gpt-model-picker-diagnostics' });
        const hookStatus = createElement('div', { class: 'gpt-model-picker-status', role: 'status' });
        const catalogStatus = createElement('div', { class: 'gpt-model-picker-status', role: 'status' }, '\u041a\u0430\u0442\u0430\u043b\u043e\u0433\u0438: \u0438\u043d\u0438\u0446\u0438\u0430\u043b\u0438\u0437\u0430\u0446\u0438\u044f\u2026');
        const selectedStatus = createElement('div', { class: 'gpt-model-picker-status', role: 'status' }, '\u0412\u044b\u0431\u0440\u0430\u043d\u0430: \u043d\u0435 \u0437\u0430\u0434\u0430\u043d\u0430');
        const requestStatus = createElement('div', { class: 'gpt-model-picker-status', role: 'status' }, '\u0417\u0430\u043f\u0440\u043e\u0441: \u0435\u0449\u0451 \u043d\u0435 \u043e\u0442\u043f\u0440\u0430\u0432\u043b\u044f\u043b\u0441\u044f');
        const backendStatus = createElement('div', { class: 'gpt-model-picker-status', role: 'status' }, 'Backend: \u0435\u0449\u0451 \u043d\u0435 \u043f\u0440\u043e\u0432\u0435\u0440\u0435\u043d');
        const hint = createElement('div', { class: 'gpt-model-picker-hint' }, '\u041f\u0440\u043e\u0432\u0435\u0440\u043a\u0430 backend \u043f\u043e\u044f\u0432\u0438\u0442\u0441\u044f \u043f\u043e\u0441\u043b\u0435 \u043e\u0442\u0432\u0435\u0442\u0430 \u043d\u0430 \u0441\u043b\u0435\u0434\u0443\u044e\u0449\u0435\u0435 \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435.');

        header.append(title, collapseButton);
        buttons.append(applyButton, reloadButton, restoreButton);
        diagnostics.append(hookStatus, catalogStatus, selectedStatus, requestStatus, backendStatus);
        panel.append(header, select, input, buttons, diagnostics, hint);
        document.body.append(panel);

        Object.assign(state, {
            panel,
            header,
            collapseButton,
            select,
            input,
            hookStatus,
            catalogStatus,
            selectedStatus,
            requestStatus,
            backendStatus
        });

        select.addEventListener('change', () => setSelectedModel(select.value, true));
        applyButton.addEventListener('click', () => {
            setSelectedModel(input.value, true);
            renderModels();
        });
        reloadButton.addEventListener('click', loadModels);
        restoreButton.addEventListener('click', restoreHook);
        collapseButton.addEventListener('click', () => setPanelCollapsed(!state.collapsed, true));
        header.addEventListener('pointerdown', handleHeaderPointerDown);
        header.addEventListener('pointermove', handleHeaderPointerMove);
        header.addEventListener('pointerup', handleHeaderPointerUp);
        header.addEventListener('pointercancel', handleHeaderPointerUp);
        window.addEventListener('resize', handleWindowResize);

        setPanelCollapsed(localStorage.getItem(config.collapsedStorageKey) === 'true', false);
        restorePanelPosition();
    }

    /** Добавляет стили панели выбора модели. */
    function addStyles() {
        const style = document.createElement('style');

        style.id = 'gpt-model-picker-styles';
        style.textContent = `
            #gpt-model-picker-panel {
                position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
                display: flex; width: min(520px, calc(100vw - 32px));
                max-height: calc(100vh - 32px); overflow: auto; box-sizing: border-box;
                flex-direction: column; gap: 8px; padding: 12px; color: #f5f5f5;
                background: #202123; border: 1px solid #565869; border-radius: 12px;
                box-shadow: 0 8px 30px rgb(0 0 0 / 35%); font: 13px/1.35 Arial, sans-serif;
            }
            #gpt-model-picker-panel.is-collapsed {
                width: min(300px, calc(100vw - 16px)); max-height: none; gap: 0; padding: 0;
                overflow: visible; background: transparent; border: 0; box-shadow: none;
            }
            #gpt-model-picker-panel.is-collapsed > :not(.gpt-model-picker-header) { display: none; }
            .gpt-model-picker-header {
                display: flex; min-height: 38px; align-items: center; justify-content: space-between;
                gap: 12px; padding: 0 6px 0 10px; touch-action: none; user-select: none;
                background: rgb(52 53 65 / 96%); border: 1px solid #565869; border-radius: 8px;
                cursor: grab;
            }
            #gpt-model-picker-panel.is-collapsed .gpt-model-picker-header {
                background: rgb(32 33 35 / 62%); border-color: rgb(86 88 105 / 62%);
                box-shadow: 0 6px 20px rgb(0 0 0 / 24%); backdrop-filter: blur(6px);
            }
            .gpt-model-picker-header.is-dragging { cursor: grabbing; }
            .gpt-model-picker-title { font-weight: 700; }
            .gpt-model-picker-collapse {
                display: grid; width: 28px; height: 28px; flex: 0 0 28px; place-items: center;
                padding: 0; color: #f5f5f5; background: rgb(23 24 26 / 72%);
                border: 1px solid rgb(86 88 105 / 72%); border-radius: 6px;
                font: 700 18px/1 Arial, sans-serif; cursor: pointer;
            }
            .gpt-model-picker-collapse:hover { background: rgb(68 70 84 / 90%); }
            .gpt-model-picker-select, .gpt-model-picker-input, .gpt-model-picker-button {
                min-height: 34px; box-sizing: border-box; color: #f5f5f5;
                background: #343541; border: 1px solid #565869; border-radius: 7px; font: inherit;
            }
            .gpt-model-picker-select, .gpt-model-picker-input { width: 100%; padding: 6px 8px; }
            .gpt-model-picker-buttons { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
            .gpt-model-picker-button { padding: 6px 10px; cursor: pointer; }
            .gpt-model-picker-button:hover { background: #444654; }
            .gpt-model-picker-diagnostics { display: grid; gap: 3px; padding: 8px; background: #17181a; border-radius: 7px; }
            .gpt-model-picker-status { color: #d4d4d8; word-break: break-word; }
            .gpt-model-picker-status[data-status-type='success'] { color: #86efac; }
            .gpt-model-picker-status[data-status-type='warning'] { color: #fde047; }
            .gpt-model-picker-status[data-status-type='error'] { color: #fca5a5; }
            .gpt-model-picker-hint { color: #a1a1aa; font-size: 11px; }
            @media (max-width: 640px) { .gpt-model-picker-buttons { grid-template-columns: 1fr; } }
        `;

        document.head.append(style);
    }

    /** Останавливает проверку, возвращает исходный fetch и удаляет панель. */
    function stop() {
        state.stopped = true;
        window.removeEventListener('resize', handleWindowResize);

        if (state.hookTimer !== null) {
            window.clearInterval(state.hookTimer);
            state.hookTimer = null;
        }

        const descriptor = Object.getOwnPropertyDescriptor(window, 'fetch');

        if (descriptor?.get === getGuardedFetch && descriptor?.set === setGuardedFetch) {
            Object.defineProperty(window, 'fetch', {
                configurable: state.originalFetchDescriptor?.configurable ?? true,
                enumerable: state.originalFetchDescriptor?.enumerable ?? true,
                writable: state.originalFetchDescriptor?.writable ?? true,
                value: state.downstreamFetch
            });
        }

        state.fetchGuardInstalled = false;

        state.panel?.remove();
        document.querySelector('#gpt-model-picker-styles')?.remove();
    }

    /** Запускает панель, перехват запросов и контроль window.fetch. */
    function start() {
        if (!(document.body instanceof HTMLElement)) {
            return;
        }

        addStyles();
        createPanel();
        installFetchGuard();
        state.hookTimer = window.setInterval(updateHookStatus, config.hookCheckIntervalMs);
        loadModels();
    }

    window[GLOBAL_KEY] = {
        config,
        state,
        start,
        stop,
        loadModels,
        setSelectedModel,
        restoreHook
    };

    start();
})();
