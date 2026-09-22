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

        /** Значение выбора, при котором скрипт не меняет slug модели. */
        autoModelSlug: 'auto',

        /** Ключ выбранной модели в localStorage. */
        storageKey: 'gpt-model-picker.selected-model.v2',

        /** Ключ выбранной глубины рассуждения в localStorage. */
        thinkingEffortStorageKey: 'gpt-model-picker.thinking-effort.v1',

        /** Ключ режима ускоренной обработки в localStorage. */
        fastModeStorageKey: 'gpt-model-picker.fast-mode.v1',

        /** Ключ принудительного сохранения обычного режима Chat в localStorage. */
        forceChatStorageKey: 'gpt-model-picker.force-chat.v1',

        /** Ключ позиции панели в localStorage. */
        positionStorageKey: 'gpt-model-picker.position.v1',

        /** Ключ состояния свёрнутой панели в localStorage. */
        collapsedStorageKey: 'gpt-model-picker.collapsed.v1',

        /** Период проверки и автоматического восстановления перехватчика window.fetch. */
        hookCheckIntervalMs: 1000,

        /** Количество повторных загрузок каталогов после ошибки. */
        catalogRetryCount: 2,

        /** Задержка между повторными загрузками каталогов. */
        catalogRetryDelayMs: 1500,

        /** Включает диагностические сообщения в консоли браузера. */
        debug: true
    };

    const thinkingEffortOptions = [
        { value: 'auto', label: 'Auto — не вмешиваться' },
        { value: 'min', label: 'Лёгкое — min' },
        { value: 'standard', label: 'Стандартное — standard' },
        { value: 'extended', label: 'Усиленное — extended' },
        { value: 'xhigh', label: 'Очень высокое — xhigh' },
        { value: 'max', label: 'Тяжёлое — max' },
        { value: 'ultra', label: 'Ultra — ultra' }
    ];

    const state = {
        baseFetch: window.fetch,
        downstreamFetch: window.fetch,
        originalFetchDescriptor: Object.getOwnPropertyDescriptor(window, 'fetch'),
        fetchGuardInstalled: false,
        downstreamReplacementCount: 0,
        downstreamCallDepth: 0,
        selectedModelSlug: '',
        selectedThinkingEffort: 'auto',
        fastModeEnabled: false,
        forceChatEnabled: true,
        workModels: [],
        chatModels: [],
        workDefaultModelSlug: '',
        panel: null,
        header: null,
        collapseButton: null,
        select: null,
        input: null,
        thinkingSelect: null,
        fastCheckbox: null,
        forceChatCheckbox: null,
        applyButton: null,
        reloadButton: null,
        restoreButton: null,
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
     * Вызывает текущую штатную обёртку fetch и ограничивает защиту от рекурсии
     * только синхронным вызовом нижнего слоя. Параллельные fetch-запросы не
     * отключают перехват друг для друга на время ожидания Promise.
     *
     * @param {RequestInfo | URL} input
     * @param {RequestInit | undefined} init
     * @returns {Promise<Response>}
     */
    function callDownstreamFetch(input, init) {
        if (state.downstreamCallDepth > 0) {
            return state.baseFetch.call(window, input, init);
        }

        state.downstreamCallDepth += 1;

        try {
            return state.downstreamFetch.call(window, input, init);
        } finally {
            state.downstreamCallDepth -= 1;
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
     * Изменяет модель, глубину рассуждения, скорость и режим разговора в JSON payload.
     *
     * Выбор модели Auto сохраняет исходный slug. Значение thinking effort Auto
     * сохраняет штатный thinking_effort. Включённая скорость задаёт
     * service_tier=priority, выключенная сохраняет штатный tier. Для обычного
     * primary_assistant режим «Оставаться в Chat» задаёт primary_assistant и
     * исключает Work-origin из исходящего хода. Gizmo-режимы не преобразуются.
     *
     * @param {string} body
     * @returns {{ body: string, changed: boolean, originalModelSlug: string, requestedModelSlug: string, originalThinkingEffort: string, requestedThinkingEffort: string, originalServiceTier: string, requestedServiceTier: string, originalConversationOrigin: string, originalConversationMode: string, requestedConversationMode: string } | null}
     */
    function updateConversationBody(body) {
        if (!body) {
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
        const originalThinkingEffort = String(
            payload.thinking_effort || payload.backend_thinking_effort || ''
        );
        const originalServiceTier = String(
            payload.service_tier || payload.backend_service_tier || ''
        );
        const originalConversationOrigin = String(payload.conversation_origin || '');
        const originalConversationMode = String(payload.conversation_mode?.kind || '');
        const overrideModel = state.selectedModelSlug !== config.autoModelSlug;
        const overrideThinkingEffort = state.selectedThinkingEffort !== 'auto';
        const forceChat = state.forceChatEnabled
            && overrideModel
            && (!originalConversationMode || originalConversationMode === 'primary_assistant');
        let changed = false;

        if (overrideModel) {
            if (payload.model !== state.selectedModelSlug) {
                changed = true;
            }

            payload.model = state.selectedModelSlug;

            if (Object.prototype.hasOwnProperty.call(payload, 'model_slug')) {
                if (payload.model_slug !== state.selectedModelSlug) {
                    changed = true;
                }

                payload.model_slug = state.selectedModelSlug;
            }

            if (Object.prototype.hasOwnProperty.call(payload, 'requested_model_slug')) {
                if (payload.requested_model_slug !== state.selectedModelSlug) {
                    changed = true;
                }

                payload.requested_model_slug = state.selectedModelSlug;
            }

            if (Object.prototype.hasOwnProperty.call(payload, 'backend_model')) {
                if (payload.backend_model !== state.selectedModelSlug) {
                    changed = true;
                }

                payload.backend_model = state.selectedModelSlug;
            }
        }

        if (forceChat) {
            if (payload.conversation_mode?.kind !== 'primary_assistant' || Object.keys(payload.conversation_mode || {}).length !== 1) {
                payload.conversation_mode = { kind: 'primary_assistant' };
                changed = true;
            }

            if (Object.prototype.hasOwnProperty.call(payload, 'conversation_origin')) {
                delete payload.conversation_origin;
                changed = true;
            }

            if (Object.prototype.hasOwnProperty.call(payload, 'chat_mode') && payload.chat_mode !== 'chat') {
                payload.chat_mode = 'chat';
                changed = true;
            }

            if (Object.prototype.hasOwnProperty.call(payload, 'tpp_work_handoff_conversion')) {
                delete payload.tpp_work_handoff_conversion;
                changed = true;
            }
        }

        if (overrideThinkingEffort) {
            if (payload.thinking_effort !== state.selectedThinkingEffort) {
                changed = true;
            }

            payload.thinking_effort = state.selectedThinkingEffort;

            if (Object.prototype.hasOwnProperty.call(payload, 'backend_thinking_effort')) {
                if (payload.backend_thinking_effort !== state.selectedThinkingEffort) {
                    changed = true;
                }

                payload.backend_thinking_effort = state.selectedThinkingEffort;
            }
        }

        if (state.fastModeEnabled) {
            if (payload.service_tier !== 'priority') {
                changed = true;
            }

            payload.service_tier = 'priority';

            if (Object.prototype.hasOwnProperty.call(payload, 'backend_service_tier')) {
                if (payload.backend_service_tier !== 'priority') {
                    changed = true;
                }

                payload.backend_service_tier = 'priority';
            }
        }

        return {
            body: changed ? JSON.stringify(payload) : body,
            changed,
            originalModelSlug,
            requestedModelSlug: overrideModel ? state.selectedModelSlug : originalModelSlug,
            originalThinkingEffort,
            requestedThinkingEffort: overrideThinkingEffort ? state.selectedThinkingEffort : originalThinkingEffort,
            originalServiceTier,
            requestedServiceTier: state.fastModeEnabled ? 'priority' : originalServiceTier,
            originalConversationOrigin,
            originalConversationMode,
            requestedConversationMode: forceChat ? 'chat' : originalConversationMode
        };
    }

    /**
     * Добавляет непустое строковое значение в массив без повторений.
     *
     * @param {string[]} target
     * @param {unknown} value
     */
    function appendUniqueString(target, value) {
        if (typeof value === 'string' && value && !target.includes(value)) {
            target.push(value);
        }
    }

    /**
     * Собирает сведения о модели, thinking effort и service tier из JSON-объекта ответа.
     *
     * @param {unknown} value
     * @param {{ resolvedModels: string[], assistantModels: string[], allModels: string[], thinkingEfforts: string[], serviceTiers: string[] }} result
     */
    function collectResponseInfo(value, result) {
        if (!value || typeof value !== 'object') {
            return;
        }

        if (Array.isArray(value)) {
            for (const item of value) {
                collectResponseInfo(item, result);
            }

            return;
        }

        appendUniqueString(result.resolvedModels, value.resolved_model_slug);
        appendUniqueString(result.allModels, value.model_slug);
        appendUniqueString(result.thinkingEfforts, value.thinking_effort);
        appendUniqueString(result.thinkingEfforts, value.backend_thinking_effort);
        appendUniqueString(result.serviceTiers, value.service_tier);
        appendUniqueString(result.serviceTiers, value.backend_service_tier);

        if (value.author?.role === 'assistant' && value.metadata) {
            appendUniqueString(result.resolvedModels, value.metadata.resolved_model_slug);
            appendUniqueString(result.assistantModels, value.metadata.model_slug);
            appendUniqueString(result.thinkingEfforts, value.metadata.thinking_effort);
            appendUniqueString(result.serviceTiers, value.metadata.service_tier);
        }

        for (const nestedValue of Object.values(value)) {
            collectResponseInfo(nestedValue, result);
        }
    }

    /**
     * Возвращает сведения, раскрытые backend-событиями потокового ответа.
     *
     * @param {string} responseText
     * @returns {{ modelSlug: string, thinkingEffort: string, serviceTier: string }}
     */
    function extractResponseInfo(responseText) {
        const result = {
            resolvedModels: [],
            assistantModels: [],
            allModels: [],
            thinkingEfforts: [],
            serviceTiers: []
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
                collectResponseInfo(JSON.parse(jsonText), result);
            } catch {
                continue;
            }
        }

        return {
            modelSlug: result.resolvedModels.at(-1) || result.assistantModels.at(-1) || result.allModels.at(-1) || '',
            thinkingEffort: result.thinkingEfforts.at(-1) || '',
            serviceTier: result.serviceTiers.at(-1) || ''
        };
    }

    /**
     * Отображает параметры, раскрытые backend-событиями ответа.
     *
     * @param {{ requestedModelSlug: string, requestedThinkingEffort: string, requestedServiceTier: string }} requestInfo
     * @param {{ modelSlug: string, thinkingEffort: string, serviceTier: string }} responseInfo
     */
    function displayBackendInfo(requestInfo, responseInfo) {
        if (responseInfo.modelSlug) {
            state.lastResolvedModelSlug = responseInfo.modelSlug;
        }

        const details = [];
        let type = 'success';

        if (responseInfo.modelSlug) {
            if (requestInfo.requestedModelSlug && responseInfo.modelSlug !== requestInfo.requestedModelSlug) {
                details.push(`модель ${requestInfo.requestedModelSlug} → ${responseInfo.modelSlug}`);
                type = 'warning';
            } else {
                details.push(`модель ${responseInfo.modelSlug}`);
            }
        }

        if (responseInfo.thinkingEffort) {
            details.push(`thinking ${responseInfo.thinkingEffort}`);
        }

        if (responseInfo.serviceTier) {
            details.push(`speed ${responseInfo.serviceTier}`);
        }

        updateBackendStatus(
            details.length > 0
                ? `Backend: ${details.join('; ')}`
                : 'Backend: HTTP 200; модель и параметры потоком не раскрыты',
            type
        );
    }

    /**
     * Читает копию потокового ответа и отображает параметры, раскрытые backend.
     *
     * @param {Response} response
     * @param {{ requestedModelSlug: string, requestedThinkingEffort: string, requestedServiceTier: string }} requestInfo
     */
    async function observeConversationResponse(response, requestInfo) {
        if (!response.ok) {
            updateBackendStatus(`Backend: HTTP ${response.status}; модель ${requestInfo.requestedModelSlug || 'Auto'}`, 'error');
            return;
        }

        const responseBody = response.clone().body;

        if (!responseBody) {
            updateBackendStatus(`Backend: HTTP ${response.status}; поток данных отсутствует`, 'success');
            return;
        }

        const reader = responseBody.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let responseInfo = {
            modelSlug: '',
            thinkingEffort: '',
            serviceTier: ''
        };

        try {
            while (true) {
                const { value, done } = await reader.read();
                buffer += decoder.decode(value || new Uint8Array(), { stream: !done });

                const lines = buffer.split(/\r?\n/);
                buffer = done ? '' : lines.pop() || '';
                const currentInfo = extractResponseInfo(lines.join('\n'));

                responseInfo = {
                    modelSlug: currentInfo.modelSlug || responseInfo.modelSlug,
                    thinkingEffort: currentInfo.thinkingEffort || responseInfo.thinkingEffort,
                    serviceTier: currentInfo.serviceTier || responseInfo.serviceTier
                };

                if (currentInfo.modelSlug || currentInfo.thinkingEffort || currentInfo.serviceTier) {
                    displayBackendInfo(requestInfo, responseInfo);
                }

                if (done) {
                    break;
                }
            }

            if (buffer) {
                const tailInfo = extractResponseInfo(buffer);
                responseInfo = {
                    modelSlug: tailInfo.modelSlug || responseInfo.modelSlug,
                    thinkingEffort: tailInfo.thinkingEffort || responseInfo.thinkingEffort,
                    serviceTier: tailInfo.serviceTier || responseInfo.serviceTier
                };
            }

            displayBackendInfo(requestInfo, responseInfo);
        } catch (error) {
            if (responseInfo.modelSlug || responseInfo.thinkingEffort || responseInfo.serviceTier) {
                displayBackendInfo(requestInfo, responseInfo);
                log('response stream closed after backend data detection', error);
            } else if (error?.name === 'AbortError' || /aborted/i.test(String(error?.message || ''))) {
                updateBackendStatus('Backend: HTTP 200; поток закрыт ChatGPT, параметры не раскрыты', 'success');
                log('response stream aborted before backend data detection', error);
            } else {
                updateBackendStatus(`Backend: ошибка чтения ответа: ${error.message}`, 'error');
                log('response inspection failed', error);
            }
        } finally {
            reader.releaseLock();
        }
    }

    /**
     * Формирует строку параметров, применённых к исходящему запросу.
     *
     * @param {{ originalModelSlug: string, requestedModelSlug: string, requestedThinkingEffort: string, requestedServiceTier: string }} requestInfo
     * @returns {string}
     */
    function formatRequestStatus(requestInfo) {
        const modelText = state.selectedModelSlug === config.autoModelSlug
            ? `Auto (${requestInfo.originalModelSlug || 'штатный slug'})`
            : requestInfo.originalModelSlug && requestInfo.originalModelSlug !== requestInfo.requestedModelSlug
                ? `${requestInfo.originalModelSlug} → ${requestInfo.requestedModelSlug}`
                : requestInfo.requestedModelSlug;
        const thinkingText = state.selectedThinkingEffort === 'auto'
            ? `thinking Auto${requestInfo.requestedThinkingEffort ? ` (${requestInfo.requestedThinkingEffort})` : ''}`
            : `thinking ${requestInfo.requestedThinkingEffort}`;
        const speedText = state.fastModeEnabled
            ? 'скорость 1.5x (priority)'
            : `скорость штатная${requestInfo.requestedServiceTier ? ` (${requestInfo.requestedServiceTier})` : ''}`;
        const modeText = state.forceChatEnabled && state.selectedModelSlug !== config.autoModelSlug
            ? `режим Chat${requestInfo.originalConversationOrigin ? `; origin ${requestInfo.originalConversationOrigin} → Chat` : ''}`
            : `режим штатный${requestInfo.originalConversationMode ? ` (${requestInfo.originalConversationMode})` : ''}`;

        return `Запрос: ${modelText}; ${thinkingText}; ${speedText}; ${modeText}`;
    }

    /**
     * Перехватывает запрос создания хода, применяет выбранные параметры и наблюдает ответ.
     *
     * @param {RequestInfo | URL} input
     * @param {RequestInit | undefined} init
     * @returns {Promise<Response>}
     */
    async function fetchWithSelectedModel(input, init) {
        if (state.downstreamCallDepth > 0) {
            return state.baseFetch.call(window, input, init);
        }

        if (state.stopped || getRequestPath(input) !== config.conversationPath) {
            return callDownstreamFetch(input, init);
        }

        const requestBody = await readRequestBody(input, init);
        const requestInfo = requestBody && updateConversationBody(requestBody.body);

        if (!requestBody || !requestInfo) {
            updateRequestStatus('Запрос: JSON payload не прочитан', 'error');
            return callDownstreamFetch(input, init);
        }

        const rebuilt = requestInfo.changed
            ? requestBody.rebuild(requestInfo.body)
            : null;

        state.lastRequestedModelSlug = requestInfo.requestedModelSlug;
        state.lastResolvedModelSlug = '';
        updateRequestStatus(formatRequestStatus(requestInfo), 'success');
        updateBackendStatus('Backend: ожидание ответа…', 'neutral');
        log('conversation request parameters', requestInfo);

        const response = rebuilt
            ? Array.isArray(rebuilt)
                ? await callDownstreamFetch(rebuilt[0], rebuilt[1])
                : await callDownstreamFetch(rebuilt)
            : await callDownstreamFetch(input, init);

        observeConversationResponse(response, requestInfo);

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

    /** Обновляет строку выбранных параметров панели. */
    function updateSelectedStatus() {
        const modelText = state.selectedModelSlug === config.autoModelSlug
            ? 'Auto (slug без вмешательства)'
            : state.selectedModelSlug;
        const thinkingText = state.selectedThinkingEffort === 'auto'
            ? 'Auto'
            : state.selectedThinkingEffort;
        const speedText = state.fastModeEnabled ? '1.5x / priority' : 'штатная';
        const modeText = state.forceChatEnabled && state.selectedModelSlug !== config.autoModelSlug
            ? 'Chat принудительно'
            : 'штатный';

        setStatus(
            state.selectedStatus,
            `Выбрано: ${modelText}; thinking ${thinkingText}; скорость ${speedText}; режим ${modeText}`,
            'success'
        );
    }

    /**
     * Устанавливает модель и сохраняет её идентификатор.
     *
     * Значение auto отключает замену slug в исходящих запросах.
     *
     * @param {string} modelSlug
     * @param {boolean} persist
     */
    function setSelectedModel(modelSlug, persist) {
        const normalizedSlug = String(modelSlug || '').trim() || config.autoModelSlug;

        state.selectedModelSlug = normalizedSlug;

        if (persist) {
            localStorage.setItem(config.storageKey, normalizedSlug);
        }

        if (state.select) {
            state.select.value = normalizedSlug;
        }

        if (state.input && state.input.value !== normalizedSlug) {
            state.input.value = normalizedSlug;
        }

        renderThinkingEfforts();
        updateSelectedStatus();
        restoreHook();
    }

    /**
     * Устанавливает глубину рассуждения и сохраняет её значение.
     *
     * Значение auto сохраняет штатный thinking_effort исходящего запроса.
     *
     * @param {string} thinkingEffort
     * @param {boolean} persist
     */
    function setSelectedThinkingEffort(thinkingEffort, persist) {
        const normalizedEffort = thinkingEffortOptions.some((option) => option.value === thinkingEffort)
            ? thinkingEffort
            : 'auto';

        state.selectedThinkingEffort = normalizedEffort;

        if (persist) {
            localStorage.setItem(config.thinkingEffortStorageKey, normalizedEffort);
        }

        if (state.thinkingSelect) {
            state.thinkingSelect.value = normalizedEffort;
        }

        updateSelectedStatus();
    }

    /**
     * Включает или выключает запрос ускоренного service tier и сохраняет состояние.
     *
     * @param {boolean} enabled
     * @param {boolean} persist
     */
    function setFastModeEnabled(enabled, persist) {
        state.fastModeEnabled = Boolean(enabled);

        if (persist) {
            localStorage.setItem(config.fastModeStorageKey, String(state.fastModeEnabled));
        }

        if (state.fastCheckbox) {
            state.fastCheckbox.checked = state.fastModeEnabled;
        }

        updateSelectedStatus();
    }

    /**
     * Включает или выключает принудительную отправку обычного режима Chat.
     *
     * При включении исходящий ход использует conversation_mode=primary_assistant,
     * не передаёт conversation_origin Work и сохраняет выбранный model slug.
     *
     * @param {boolean} enabled
     * @param {boolean} persist
     */
    function setForceChatEnabled(enabled, persist) {
        state.forceChatEnabled = Boolean(enabled);

        if (persist) {
            localStorage.setItem(config.forceChatStorageKey, String(state.forceChatEnabled));
        }

        if (state.forceChatCheckbox) {
            state.forceChatCheckbox.checked = state.forceChatEnabled;
        }

        updateSelectedStatus();
        restoreHook();
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
            option.textContent = `${model.title || model.slug} — ${model.slug}`;
            group.append(option);
        }

        if (group.children.length > 0) {
            select.append(group);
        }
    }

    /** Возвращает описание выбранной модели из загруженных каталогов. */
    function getSelectedModel() {
        if (state.selectedModelSlug === config.autoModelSlug) {
            return null;
        }

        return [...state.workModels, ...state.chatModels]
            .find((model) => model.slug === state.selectedModelSlug) || null;
    }

    /**
     * Возвращает объявленные моделью значения thinking_effort.
     *
     * @param {Record<string, any> | null} model
     * @returns {string[] | null}
     */
    function getModelThinkingEfforts(model) {
        if (!model) {
            return null;
        }

        const efforts = Array.isArray(model.thinking_efforts)
            ? model.thinking_efforts
            : Array.isArray(model.thinkingEfforts)
                ? model.thinkingEfforts
                : null;

        if (!efforts) {
            return null;
        }

        return efforts
            .map((effort) => typeof effort === 'string' ? effort : effort?.thinking_effort)
            .filter((effort) => typeof effort === 'string' && effort);
    }

    /**
     * Возвращает описание thinking effort из каталога выбранной модели.
     *
     * @param {Record<string, any> | null} model
     * @param {string} value
     * @returns {Record<string, any> | null}
     */
    function getModelThinkingEffortDetails(model, value) {
        if (!model) {
            return null;
        }

        const efforts = Array.isArray(model.thinking_efforts)
            ? model.thinking_efforts
            : Array.isArray(model.thinkingEfforts)
                ? model.thinkingEfforts
                : [];

        return efforts.find((effort) => {
            return typeof effort === 'object' && effort?.thinking_effort === value;
        }) || null;
    }

    /** Заполняет список глубины рассуждения и отмечает неподдерживаемые значения. */
    function renderThinkingEfforts() {
        if (!state.thinkingSelect) {
            return;
        }

        const selectedModel = getSelectedModel();
        const supportedEfforts = getModelThinkingEfforts(selectedModel);
        state.thinkingSelect.replaceChildren();

        for (const effort of thinkingEffortOptions) {
            const details = getModelThinkingEffortDetails(selectedModel, effort.value);
            const catalogLabel = details?.short_label || details?.full_label || details?.mobile_full_label;
            const optionLabel = catalogLabel ? `${catalogLabel} — ${effort.value}` : effort.label;
            const option = createElement('option', { value: effort.value }, optionLabel);

            if (
                effort.value !== 'auto'
                && supportedEfforts
                && !supportedEfforts.includes(effort.value)
                && effort.value !== state.selectedThinkingEffort
            ) {
                option.disabled = true;
            }

            state.thinkingSelect.append(option);
        }

        state.thinkingSelect.value = state.selectedThinkingEffort;
    }

    /** Заполняет список Auto, Work-моделями, обычными моделями и ручным slug. */
    function renderModels() {
        if (!state.select) {
            return;
        }

        state.select.replaceChildren();
        state.select.append(createElement('option', { value: config.autoModelSlug }, 'Auto — не менять slug'));
        appendModelGroup(state.select, 'Модели Work / TPP', state.workModels);
        appendModelGroup(state.select, 'Обычный ChatGPT', state.chatModels);

        const allModels = [...state.workModels, ...state.chatModels];

        if (
            state.selectedModelSlug
            && state.selectedModelSlug !== config.autoModelSlug
            && !allModels.some((model) => model.slug === state.selectedModelSlug)
        ) {
            const group = createElement('optgroup', { label: 'Ручной slug' });
            group.append(createElement('option', { value: state.selectedModelSlug }, `${state.selectedModelSlug} — вручную`));
            state.select.append(group);
        }

        state.select.value = state.selectedModelSlug;
        renderThinkingEfforts();
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

    /**
     * Загружает отдельные каталоги Work и обычного ChatGPT.
     *
     * После ошибки автоматически повторяет загрузку ограниченное число раз.
     *
     * @param {number} [attempt]
     */
    async function loadModels(attempt = 0) {
        setStatus(state.catalogStatus, 'Каталоги: загрузка…', 'neutral');

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
            setSelectedModel(
                localStorage.getItem(config.storageKey) || config.autoModelSlug,
                false
            );
        }

        renderModels();

        if (errors.length > 0) {
            if (attempt < config.catalogRetryCount) {
                setStatus(
                    state.catalogStatus,
                    `Каталоги: повтор ${attempt + 1}/${config.catalogRetryCount}…`,
                    'warning'
                );
                window.setTimeout(() => loadModels(attempt + 1), config.catalogRetryDelayMs);
            } else {
                setStatus(state.catalogStatus, `Каталоги: ${errors.join('; ')}`, 'error');
            }
        } else {
            setStatus(state.catalogStatus, `Каталоги: Work ${state.workModels.length}; ChatGPT ${state.chatModels.length}`, 'success');
        }

        log('model catalogs loaded', {
            workModels: state.workModels,
            chatModels: state.chatModels,
            workDefaultModelSlug: state.workDefaultModelSlug,
            attempt
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

    /** Применяет ручной slug после каждого изменения поля ввода. */
    function handleManualModelInput() {
        setSelectedModel(state.input.value, true);
        renderModels();
    }

    /** Добавляет панель выбора модели, thinking effort, скорости и диагностики на страницу. */
    function createPanel() {
        const panel = createElement('section', {
            id: 'gpt-model-picker-panel',
            role: 'dialog',
            'aria-label': 'Выбор и контроль модели ChatGPT'
        });
        const header = createElement('div', { class: 'gpt-model-picker-header' });
        const title = createElement('div', { class: 'gpt-model-picker-title' }, 'Модель ChatGPT');
        const collapseButton = createElement('button', {
            class: 'gpt-model-picker-collapse',
            type: 'button',
            'aria-label': 'Свернуть панель',
            'aria-expanded': 'true'
        }, '−');
        const modelLabel = createElement('label', { class: 'gpt-model-picker-field' });
        const modelLabelText = createElement('span', { class: 'gpt-model-picker-field-label' }, 'Модель');
        const select = createElement('select', {
            class: 'gpt-model-picker-select',
            'aria-label': 'Модель ChatGPT'
        });
        const inputLabel = createElement('label', { class: 'gpt-model-picker-field' });
        const inputLabelText = createElement('span', { class: 'gpt-model-picker-field-label' }, 'Ручной slug');
        const input = createElement('input', {
            class: 'gpt-model-picker-input',
            type: 'text',
            placeholder: 'model_slug вручную',
            'aria-label': 'Идентификатор модели вручную'
        });
        const thinkingLabel = createElement('label', { class: 'gpt-model-picker-field' });
        const thinkingLabelText = createElement('span', { class: 'gpt-model-picker-field-label' }, 'Как сильно думать');
        const thinkingSelect = createElement('select', {
            class: 'gpt-model-picker-select',
            'aria-label': 'Глубина рассуждения'
        });
        const fastLabel = createElement('label', { class: 'gpt-model-picker-fast' });
        const fastCheckbox = createElement('input', {
            class: 'gpt-model-picker-checkbox',
            type: 'checkbox',
            'aria-label': 'Скорость 1.5x'
        });
        const fastText = createElement('span', {}, 'Скорость 1.5x');
        const forceChatLabel = createElement('label', { class: 'gpt-model-picker-fast' });
        const forceChatCheckbox = createElement('input', {
            class: 'gpt-model-picker-checkbox',
            type: 'checkbox',
            'aria-label': 'Оставаться в режиме Chat'
        });
        const forceChatText = createElement('span', {}, 'Оставаться в Chat');
        const buttons = createElement('div', { class: 'gpt-model-picker-buttons' });
        const applyButton = createElement('button', { class: 'gpt-model-picker-button', type: 'button' }, 'Применить сейчас');
        const reloadButton = createElement('button', { class: 'gpt-model-picker-button', type: 'button' }, 'Обновить каталоги');
        const restoreButton = createElement('button', { class: 'gpt-model-picker-button', type: 'button' }, 'Вернуть перехват');
        const diagnostics = createElement('div', { class: 'gpt-model-picker-diagnostics' });
        const hookStatus = createElement('div', { class: 'gpt-model-picker-status', role: 'status' });
        const catalogStatus = createElement('div', { class: 'gpt-model-picker-status', role: 'status' }, 'Каталоги: инициализация…');
        const selectedStatus = createElement('div', { class: 'gpt-model-picker-status', role: 'status' }, 'Выбрано: инициализация…');
        const requestStatus = createElement('div', { class: 'gpt-model-picker-status', role: 'status' }, 'Запрос: ещё не отправлялся');
        const backendStatus = createElement('div', { class: 'gpt-model-picker-status', role: 'status' }, 'Backend: ещё не проверен');
        const hint = createElement('div', { class: 'gpt-model-picker-hint' }, 'Выбор применяется сразу. Кнопки оставлены как ручной резерв. Оставаться в Chat задаёт primary_assistant и не передаёт Work origin. Auto не вмешивается в модель.');

        header.append(title, collapseButton);
        modelLabel.append(modelLabelText, select);
        inputLabel.append(inputLabelText, input);
        thinkingLabel.append(thinkingLabelText, thinkingSelect);
        fastLabel.append(fastCheckbox, fastText);
        forceChatLabel.append(forceChatCheckbox, forceChatText);
        buttons.append(applyButton, reloadButton, restoreButton);
        diagnostics.append(hookStatus, catalogStatus, selectedStatus, requestStatus, backendStatus);
        panel.append(header, modelLabel, inputLabel, thinkingLabel, fastLabel, forceChatLabel, buttons, diagnostics, hint);
        document.body.append(panel);

        Object.assign(state, {
            panel,
            header,
            collapseButton,
            select,
            input,
            thinkingSelect,
            fastCheckbox,
            forceChatCheckbox,
            applyButton,
            reloadButton,
            restoreButton,
            hookStatus,
            catalogStatus,
            selectedStatus,
            requestStatus,
            backendStatus
        });

        select.addEventListener('change', () => {
            setSelectedModel(select.value, true);
            renderModels();
        });
        input.addEventListener('input', handleManualModelInput);
        thinkingSelect.addEventListener('change', () => setSelectedThinkingEffort(thinkingSelect.value, true));
        fastCheckbox.addEventListener('change', () => setFastModeEnabled(fastCheckbox.checked, true));
        forceChatCheckbox.addEventListener('change', () => setForceChatEnabled(forceChatCheckbox.checked, true));
        applyButton.addEventListener('click', () => {
            setSelectedModel(input.value, true);
            renderModels();
            restoreHook();
        });
        reloadButton.addEventListener('click', () => {
            restoreHook();
            loadModels();
        });
        restoreButton.addEventListener('click', restoreHook);
        collapseButton.addEventListener('click', () => setPanelCollapsed(!state.collapsed, true));
        header.addEventListener('pointerdown', handleHeaderPointerDown);
        header.addEventListener('pointermove', handleHeaderPointerMove);
        header.addEventListener('pointerup', handleHeaderPointerUp);
        header.addEventListener('pointercancel', handleHeaderPointerUp);
        window.addEventListener('resize', handleWindowResize);

        state.selectedThinkingEffort = localStorage.getItem(config.thinkingEffortStorageKey) || 'auto';
        state.fastModeEnabled = localStorage.getItem(config.fastModeStorageKey) === 'true';
        state.forceChatEnabled = localStorage.getItem(config.forceChatStorageKey) !== 'false';
        setSelectedThinkingEffort(state.selectedThinkingEffort, false);
        setFastModeEnabled(state.fastModeEnabled, false);
        setForceChatEnabled(state.forceChatEnabled, false);
        setPanelCollapsed(localStorage.getItem(config.collapsedStorageKey) === 'true', false);
        restorePanelPosition();
    }

    /** Добавляет стили панели выбора модели и параметров генерации. */
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
            .gpt-model-picker-field { display: grid; gap: 4px; }
            .gpt-model-picker-field-label { color: #d4d4d8; font-size: 11px; }
            .gpt-model-picker-select, .gpt-model-picker-input {
                width: 100%; min-height: 34px; box-sizing: border-box; padding: 6px 8px;
                color: #f5f5f5; background: #343541; border: 1px solid #565869;
                border-radius: 7px; font: inherit;
            }
            .gpt-model-picker-fast {
                display: flex; min-height: 32px; align-items: center; gap: 8px; padding: 0 4px;
                color: #f5f5f5; cursor: pointer; user-select: none;
            }
            .gpt-model-picker-checkbox { width: 16px; height: 16px; margin: 0; accent-color: auto; }
            .gpt-model-picker-buttons { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
            .gpt-model-picker-button {
                min-height: 34px; padding: 6px 10px; box-sizing: border-box; color: #f5f5f5;
                background: #343541; border: 1px solid #565869; border-radius: 7px; font: inherit; cursor: pointer;
            }
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
        state.hookTimer = window.setInterval(restoreHook, config.hookCheckIntervalMs);
        loadModels();
    }

    window[GLOBAL_KEY] = {
        config,
        state,
        start,
        stop,
        loadModels,
        setSelectedModel,
        setSelectedThinkingEffort,
        setFastModeEnabled,
        setForceChatEnabled,
        restoreHook
    };

    start();
})();
