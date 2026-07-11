const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, x-app-key'
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }
    if (request.method !== 'POST') {
      return json({ error: 'الطريقة غير مدعومة' }, 405);
    }
    if (env.APP_SHARED_KEY && request.headers.get('x-app-key') !== env.APP_SHARED_KEY) {
      return json({ error: 'غير مصرح' }, 401);
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return json({ error: 'طلب غير صالح' }, 400);
    }

    const question = (body.question || '').toString().trim().slice(0, 2000);
    const history = Array.isArray(body.history) ? body.history.slice(-6) : [];
    const laws = Array.isArray(body.laws) ? body.laws : [];

    if (!question) {
      return json({ error: 'الرجاء كتابة سؤال' }, 400);
    }
    if (!env.ANTHROPIC_API_KEY) {
      return json({ error: 'لم يتم إعداد مفتاح الذكاء الاصطناعي على الخادم' }, 500);
    }

    const context = laws.length
      ? laws.map(l => `### ${l.title}\nالمصدر: ${l.source || 'غير محدد'}\n${l.body || l.summary || ''}`).join('\n\n')
      : 'لا توجد أي نصوص قانونية مضافة إلى التطبيق حتى الآن.';

    const systemPrompt = [
      'أنت مساعد متخصص يعاون معاون مدير عام الإشراف التربوي في وزارة التربية العراقية على فهم القوانين والتعليمات الخاصة بعمله.',
      'أجب حصراً استناداً إلى النصوص القانونية المرفقة أدناه بين علامتي ###.',
      'إن لم تجد إجابة واضحة ضمن هذه النصوص، صرّح بذلك بوضوح واقترح على المستخدم مراجعة الجهة الرسمية المختصة، ولا تخترع أي نص أو رقم قانون غير موجود فعلياً في السياق المرفق.',
      'اذكر دائماً عنوان القانون أو التعليمات التي استندت إليها في إجابتك عند توفرها.',
      'أجب باللغة العربية الفصحى الواضحة والمختصرة.',
      '',
      'النصوص المتاحة:',
      context
    ].join('\n');

    const messages = [
      ...history
        .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
        .map(m => ({ role: m.role, content: m.content.slice(0, 4000) })),
      { role: 'user', content: question }
    ];

    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-5',
          max_tokens: 1500,
          system: systemPrompt,
          messages
        })
      });

      if (!resp.ok) {
        const detail = await resp.text();
        return json({ error: 'تعذر الاتصال بخدمة الذكاء الاصطناعي', detail }, 502);
      }

      const data = await resp.json();
      const answer = (data.content || []).map(b => b.text || '').join('\n').trim() || 'تعذر الحصول على إجابة.';
      return json({ answer });
    } catch (e) {
      return json({ error: 'حدث خطأ غير متوقع أثناء معالجة السؤال' }, 500);
    }
  }
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...CORS_HEADERS }
  });
}
