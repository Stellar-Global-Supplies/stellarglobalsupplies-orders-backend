/**
 * SGS Order email templates — ported from Lambda emailTemplates.js.
 * No Node.js dependencies — pure string building, works in CF Workers.
 */

const B = {
    teal:'#00B98E',tealDark:'#009B76',tealLight:'#E8F8F3',navy:'#0D1F2D',slate:'#1E3448',
    white:'#FFFFFF',grey:'#F4F7FB',border:'#E2E8F0',text:'#1A202C',muted:'#64748B',
  };
  const STATUS = {
    'Order Received':    {bg:'#EFF6FF',text:'#1D4ED8',bar:'#3B82F6',emoji:'📋'},
    'Processing':        {bg:'#FFFBEB',text:'#B45309',bar:'#F59E0B',emoji:'⚙️'},
    'Ready to Dispatch': {bg:'#F5F3FF',text:'#6D28D9',bar:'#8B5CF6',emoji:'📦'},
    'Delivered':         {bg:'#ECFDF5',text:'#065F46',bar:'#10B981',emoji:'✅'},
  };
  
  function formatDate(d) {
    if (!d) return 'TBD';
    return new Date(d).toLocaleDateString('en-IN',{day:'2-digit',month:'long',year:'numeric'});
  }
  function formatCurrency(n){return `₹${Number(n).toLocaleString('en-IN')}`;}
  
  function shell(preheader,headerAccentColor,body){
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Stellar Global Supplies</title>
  <style>@media only screen and (max-width:600px){.outer{padding:12px!important}.btn-row td{display:block!important;padding:0 0 10px!important}}</style>
  </head><body style="margin:0;padding:0;background:#EEF2F6;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  ${preheader?`<div style="display:none;max-height:0;overflow:hidden;">${preheader}</div>`:''}
  <table class="outer" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#EEF2F6;padding:32px 16px;">
  <tr><td align="center">
  <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 4px 32px rgba(0,0,0,.08);">
  <tr><td style="background:linear-gradient(135deg,${B.navy} 0%,${B.slate} 100%);padding:0;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td style="height:4px;background:linear-gradient(90deg,${headerAccentColor||B.teal},${B.tealDark});">&nbsp;</td></tr>
    </table>
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="padding:24px 32px;">
      <tr>
        <td><table cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="width:44px;height:44px;background:${B.teal};border-radius:10px;text-align:center;vertical-align:middle;">
            <span style="font-size:17px;font-weight:900;color:#fff;line-height:44px;display:block;">SG</span>
          </td>
          <td style="padding-left:14px;vertical-align:middle;">
            <div style="font-size:15px;font-weight:700;color:#fff;">Stellar Global Supplies</div>
            <div style="font-size:10.5px;color:${B.teal};letter-spacing:1px;text-transform:uppercase;font-weight:700;">Order Management System</div>
          </td>
        </tr></table></td>
        <td align="right" style="vertical-align:middle;"><div style="font-size:11px;color:rgba(255,255,255,0.35);">stellarglobalsupplies@gmail.com</div></td>
      </tr>
    </table>
  </td></tr>
  <tr><td style="background:#fff;padding:32px 36px 0;">${body}</td></tr>
  <tr><td style="background:${B.navy};padding:28px 36px;border-radius:0 0 20px 20px;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td align="center" style="padding-bottom:16px;"><table cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="padding:0 12px;"><a href="tel:+919637655556" style="font-size:12px;color:rgba(255,255,255,0.5);text-decoration:none;">📞 +91 96376 55556</a></td>
        <td style="color:rgba(255,255,255,0.15);font-size:12px;">|</td>
        <td style="padding:0 12px;"><a href="mailto:stellarglobalsupplies@gmail.com" style="font-size:12px;color:rgba(255,255,255,0.5);text-decoration:none;">✉️ Email Us</a></td>
        <td style="color:rgba(255,255,255,0.15);font-size:12px;">|</td>
        <td style="padding:0 12px;"><a href="https://stellarglobalsupplies.com" style="font-size:12px;color:rgba(255,255,255,0.5);text-decoration:none;">🌐 Website</a></td>
      </tr></table></td></tr>
      <tr><td align="center"><div style="font-size:12px;color:rgba(255,255,255,0.25);">© ${new Date().getFullYear()} Stellar Global Supplies &nbsp;·&nbsp; India's Most Reliable Industrial Supply Partner</div></td></tr>
      <tr><td align="center" style="padding-top:10px;"><div style="font-size:11px;color:rgba(255,255,255,0.3);">Crafted by <a href="https://stellarforge.stellarglobalsupplies.com/" style="color:rgba(125,211,252,0.8);text-decoration:none;font-weight:600;">Stellar Forge</a> — have a project in mind? <a href="https://stellarforge.stellarglobalsupplies.com/contact/" style="color:rgba(125,211,252,0.8);text-decoration:underline;">Send us your enquiry →</a></div></td></tr>
    </table>
  </td></tr>
  </table></td></tr></table></body></html>`;
  }
  
  function productsTable(products){
    const grandTotal=products.reduce((s,p)=>s+(Number(p.sale_cost)||0)+(Number(p.cgst)||0)+(Number(p.sgst)||0),0);
    const hasDesc=products.some(p=>p.description?.trim());
    const hasTax=products.some(p=>Number(p.cgst)>0||Number(p.sgst)>0);
    const cols=3+(hasDesc?1:0)+(hasTax?2:0);
    return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1.5px solid ${B.border};border-radius:12px;overflow:hidden;border-collapse:collapse;">
  <tr style="background:${B.teal};">
    <th style="padding:12px 10px;font-size:12px;color:#fff;font-weight:700;text-align:left;">Product</th>
    <th style="padding:12px 10px;font-size:12px;color:#fff;font-weight:700;text-align:left;">Material</th>
    ${hasDesc?`<th style="padding:12px 10px;font-size:12px;color:#fff;font-weight:700;text-align:left;">Description</th>`:''}
    <th style="padding:12px 10px;font-size:12px;color:#fff;font-weight:700;text-align:center;">Qty</th>
    <th style="padding:12px 10px;font-size:12px;color:#fff;font-weight:700;text-align:right;">Unit Cost</th>
    ${hasTax?`<th style="padding:12px 10px;font-size:12px;color:#fff;font-weight:700;text-align:right;">CGST</th><th style="padding:12px 10px;font-size:12px;color:#fff;font-weight:700;text-align:right;">SGST</th>`:''}
    <th style="padding:12px 10px;font-size:12px;color:#fff;font-weight:700;text-align:right;">Total</th>
  </tr>
  ${products.map((p,i)=>{
    const total=(Number(p.sale_cost)||0)+(Number(p.cgst)||0)+(Number(p.sgst)||0);
    return `<tr style="background:${i%2===0?B.white:B.grey};">
    <td style="padding:11px 10px;font-size:13px;color:${B.text};font-weight:600;border-bottom:1px solid ${B.border};">${p.product_type}</td>
    <td style="padding:11px 10px;font-size:13px;color:${B.text};font-weight:600;border-bottom:1px solid ${B.border};">${p.material}</td>
    ${hasDesc?`<td style="padding:11px 10px;font-size:12px;color:${B.muted};border-bottom:1px solid ${B.border};">${p.description||'-'}</td>`:''}
    <td style="padding:11px 10px;font-size:13px;color:${B.muted};text-align:center;border-bottom:1px solid ${B.border};">${p.quantity} ${p.unit}</td>
    <td style="padding:11px 10px;font-size:13px;color:${B.text};font-weight:600;text-align:right;border-bottom:1px solid ${B.border};">${formatCurrency(p.unit_cost||0)}</td>
    ${hasTax?`<td style="padding:11px 10px;font-size:12px;color:${B.muted};text-align:right;border-bottom:1px solid ${B.border};">${formatCurrency(p.cgst||0)}</td><td style="padding:11px 10px;font-size:12px;color:${B.muted};text-align:right;border-bottom:1px solid ${B.border};">${formatCurrency(p.sgst||0)}</td>`:''}
    <td style="padding:11px 10px;font-size:13px;color:${B.text};font-weight:700;text-align:right;border-bottom:1px solid ${B.border};">${formatCurrency(total)}</td>
  </tr>`;}).join('')}
  <tr style="background:${B.tealLight};">
    <td colspan="${cols}" style="padding:12px 10px;font-size:14px;font-weight:700;text-align:right;color:${B.navy};">${hasTax?'Grand Total':'Total'}</td>
    <td style="padding:12px 10px;font-size:16px;color:${B.tealDark};font-weight:800;text-align:right;">${formatCurrency(grandTotal)}</td>
  </tr></table>`;
  }
  
  function pill(status){const s=STATUS[status]||STATUS['Order Received'];return `<span style="display:inline-block;background:${s.bg};color:${s.text};padding:5px 16px;border-radius:20px;font-size:12px;font-weight:800;">${s.emoji} ${status}</span>`;}
  function cta(href,label,bg=B.teal){return `<a href="${href}" style="display:inline-block;background:${bg};color:#fff;text-decoration:none;padding:13px 28px;border-radius:10px;font-size:14px;font-weight:700;">${label}</a>`;}
  function section(icon,title,children){return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${B.grey};border-radius:12px;overflow:hidden;margin-top:20px;"><tr><td style="padding:14px 18px;border-bottom:1px solid ${B.border};background:${B.white};"><table cellpadding="0" cellspacing="0" border="0"><tr><td style="font-size:18px;padding-right:10px;">${icon}</td><td style="font-size:12px;font-weight:800;color:${B.text};text-transform:uppercase;letter-spacing:0.6px;">${title}</td></tr></table></td></tr><tr><td style="padding:18px;">${children}</td></tr></table>`;}
  const contactBtns=`<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0;"><tr><td align="center" style="padding-bottom:16px;"><p style="margin:0;font-size:13px;color:#64748B;">Need assistance?</p></td></tr><tr class="btn-row"><td align="center"><table cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right:12px;">${cta('tel:+919637655556','📞 Call Us')}</td><td>${cta('https://wa.me/919637655556','💬 WhatsApp','#25D366')}</td></tr></table></td></tr></table>`;
  
  export function buildOrderConfirmationEmail(order,products=null){
    const orderId=order.id.slice(0,8).toUpperCase();
    const trackingUrl=order.tracking_token?`https://orders.stellarglobalsupplies.com/track/${order.tracking_token}`:null;
    const pl=products?.length?products:[{product_type:order.product_type,material:order.material,quantity:order.quantity,unit:order.unit,unit_cost:0,sale_cost:order.sale_cost}];
    const body=`<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:linear-gradient(135deg,${B.tealLight} 0%,#f0fdf8 100%);border-radius:14px;margin-bottom:28px;"><tr><td style="padding:28px;text-align:center;"><div style="font-size:48px;margin-bottom:12px;">🎉</div><h1 style="margin:0 0 8px;font-size:24px;font-weight:800;color:${B.navy};">Order Confirmed!</h1><p style="margin:0;font-size:14px;color:${B.muted};">Hi <strong>${order.customer_name}</strong>, your order is being processed.</p><div style="margin-top:16px;display:inline-block;background:#fff;border:1.5px solid ${B.teal};border-radius:10px;padding:8px 20px;"><span style="font-size:13px;color:${B.muted};">Order Reference&nbsp;&nbsp;</span><span style="font-size:15px;font-weight:800;color:${B.navy};font-family:monospace;">#${orderId}</span></div></td></tr></table>${section('📦',pl.length>1?'Products':'Order Summary',productsTable(pl))}${section('📍','Current Status',`<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-bottom:12px;">${pill(order.status)}</td></tr><tr><td style="font-size:13px;color:${B.muted};line-height:1.7;">Expected delivery by <strong>${formatDate(order.delivery_timeline)}</strong>.${order.payment_status!=='Paid'?`<br/><br/><span style="font-weight:600;">⚠️ Payment Reminder:</span> Please complete your payment at the earliest.`:''}</td></tr></table>`)}${trackingUrl?section('🔗','Track Your Order',`<p style="margin:0 0 16px;font-size:13px;color:${B.muted};">Track your order in real-time:</p>${cta(trackingUrl,`📍 Track Order #${orderId}`)}`):''}${contactBtns}`;
    const totalText=pl.map((p,i)=>`Product ${i+1}: ${p.product_type} - ${p.material} (${p.quantity} ${p.unit}) - ${formatCurrency(p.sale_cost)}`).join('\n');
    return{subject:`✅ Order Confirmed #${orderId} — Stellar Global Supplies`,html:shell(`Order #${orderId} confirmed!`,B.teal,body),text:`Stellar Global Supplies — Order Confirmed\n\nHi ${order.customer_name},\n\nOrder #${orderId} confirmed!\n\n${totalText}\nDelivery: ${formatDate(order.delivery_timeline)}${trackingUrl?`\nTrack: ${trackingUrl}`:''}\n\nContact: +91 96376 55556\n\n---\nCrafted by Stellar Forge — have a project in mind? Send us your enquiry: https://stellarforge.stellarglobalsupplies.com/contact/`};
  }
  
  export function buildStatusUpdateEmail(order,products=null){
    const orderId=order.id.slice(0,8).toUpperCase();
    const s=STATUS[order.status]||STATUS['Order Received'];
    const trackingUrl=order.tracking_token?`https://orders.stellarglobalsupplies.com/track/${order.tracking_token}`:null;
    const pl=products?.length?products:[{product_type:order.product_type,material:order.material,quantity:order.quantity,unit:order.unit,unit_cost:0,sale_cost:order.sale_cost}];
    const MSGS={'Processing':"Great news! Your order is now being processed.",'Ready to Dispatch':"Your order is packed and ready to go!",'Delivered':"Your order has been successfully delivered. Thank you!"};
    const calcTotal=list=>list.reduce((s,p)=>s+(Number(p.sale_cost)||0)+(Number(p.cgst)||0)+(Number(p.sgst)||0),0);
    const body=`<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${s.bg};border-radius:14px;border:1.5px solid ${s.bar}33;margin-bottom:28px;"><tr><td style="height:4px;background:${s.bar};border-radius:14px 14px 0 0;">&nbsp;</td></tr><tr><td style="padding:28px;text-align:center;"><div style="font-size:52px;margin-bottom:14px;">${s.emoji}</div><h1 style="margin:0 0 10px;font-size:23px;font-weight:800;color:${B.navy};">Order ${order.status}</h1><p style="margin:0 0 16px;font-size:14px;color:${B.muted};">Hi <strong>${order.customer_name}</strong>, ${MSGS[order.status]||'Your order status has been updated.'}</p>${pill(order.status)}</td></tr></table>${section('📦',pl.length>1?'Products':'Order Details',productsTable(pl))}${order.payment_status!=='Paid'?`<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F8FAFB;border:1.5px solid #E2E8F0;border-radius:12px;margin-top:16px;"><tr><td style="background:#fff;padding:14px 18px;border-bottom:1px solid #F1F5F9;"><div style="font-size:14px;font-weight:600;color:#64748B;">⚠️ Payment Reminder</div></td></tr><tr><td style="padding:16px 18px;font-size:13px;color:#64748B;line-height:1.7;">Payment status: <strong>${order.payment_status}</strong>. Please complete at the earliest.</td></tr></table>`:''}${trackingUrl?section('🔗','Live Order Tracking',`<p style="margin:0 0 16px;font-size:13px;color:${B.muted};">Track the latest status:</p>${cta(trackingUrl,`📍 Track Order #${orderId}`)}`):''}${order.invoice_url?section('📄','Invoice',`<p style="margin:0 0 16px;font-size:13px;color:${B.muted};">Your invoice is attached and available for download:</p>${cta(order.invoice_url,'📥 Download Invoice')}`):''}${contactBtns}`;
    const totalText=pl.map((p,i)=>`Product ${i+1}: ${p.product_type} - ${p.material} (${p.quantity} ${p.unit}) - ${formatCurrency((Number(p.sale_cost)||0)+(Number(p.cgst)||0)+(Number(p.sgst)||0))}`).join('\n');
    return{subject:`${s.emoji} Order ${order.status} — #${orderId} | Stellar Global Supplies`,html:shell(`Order #${orderId} is now: ${order.status}`,s.bar,body),text:`Stellar Global Supplies — Order Update\n\nHi ${order.customer_name},\n\nOrder #${orderId} is now: ${order.status}\n\n${totalText}\nTotal: ${formatCurrency(calcTotal(pl))}\nDelivery: ${formatDate(order.delivery_timeline)}${trackingUrl?`\nTrack: ${trackingUrl}`:''}\n\nContact: +91 96376 55556\n\n---\nCrafted by Stellar Forge — have a project in mind? Send us your enquiry: https://stellarforge.stellarglobalsupplies.com/contact/`};
  }
  
  export function buildDelayNotificationEmail(order,products=null){
    const orderId=order.id.slice(0,8).toUpperCase();
    const trackingUrl=order.tracking_token?`https://orders.stellarglobalsupplies.com/track/${order.tracking_token}`:null;
    const pl=products?.length?products:[{product_type:order.product_type,material:order.material,quantity:order.quantity,unit:order.unit,unit_cost:0,sale_cost:order.sale_cost}];
    const body=`<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFFBEB;border-radius:14px;border:1.5px solid #F59E0B33;margin-bottom:28px;"><tr><td style="height:4px;background:#F59E0B;border-radius:14px 14px 0 0;">&nbsp;</td></tr><tr><td style="padding:28px;text-align:center;"><div style="font-size:52px;margin-bottom:14px;">⏳</div><h1 style="margin:0 0 10px;font-size:23px;font-weight:800;color:${B.navy};">Delivery Rescheduled</h1><p style="margin:0;font-size:14px;color:${B.muted};">Hi <strong>${order.customer_name}</strong>, we sincerely apologise for the delay.</p></td></tr></table><table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fff;border:2px solid #F59E0B;border-radius:12px;margin-bottom:20px;"><tr><td style="padding:20px;text-align:center;"><div style="font-size:11px;font-weight:800;color:${B.muted};text-transform:uppercase;letter-spacing:0.7px;margin-bottom:6px;">New Delivery Date</div><div style="font-size:26px;font-weight:800;color:#B45309;">${formatDate(order.delivery_timeline)}</div></td></tr></table>${section('📦',pl.length>1?'Products':'Order Details',productsTable(pl))}${trackingUrl?section('🔗','Track Your Order',`<p style="margin:0 0 16px;font-size:13px;color:${B.muted};">Monitor your order status:</p>${cta(trackingUrl,`📍 Track Order #${orderId}`)}`):''}${contactBtns}`;
    const totalText=pl.map((p,i)=>`Product ${i+1}: ${p.product_type} - ${p.material} (${p.quantity} ${p.unit}) - ${formatCurrency(p.sale_cost)}`).join('\n');
    return{subject:`⏳ Delivery Update for Order #${orderId} — Stellar Global Supplies`,html:shell(`Delivery for #${orderId} rescheduled to ${formatDate(order.delivery_timeline)}`,'#F59E0B',body),text:`Stellar Global Supplies — Delivery Update\n\nHi ${order.customer_name},\n\nSorry — order #${orderId} delivery rescheduled.\n\n${totalText}\nNew Delivery Date: ${formatDate(order.delivery_timeline)}${trackingUrl?`\nTrack: ${trackingUrl}`:''}\n\nContact: +91 96376 55556\n\n---\nCrafted by Stellar Forge — have a project in mind? Send us your enquiry: https://stellarforge.stellarglobalsupplies.com/contact/`};
  }
