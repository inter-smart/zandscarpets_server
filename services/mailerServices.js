const Logger = require("../config/logger");
const { models } = require("../database/models");
const { createMailTransport } = require("./mailTransportFactory");
const { EMAIL_FROM, EMAIL_FROM_NAME, BASE_URL } = require("../constants");

const { transporter, options: transportOptions } = createMailTransport();

const { renderEmailLayout } = require("./mailTemplates/layout");
const { escapeHtml, oneLine, formatDateTime } = require("./mailTemplates/utils");

// Quote line items -> the layout's Product / Variant / Qty table.
const quoteItems = (items) =>
  (items || []).map((item) => ({ product: item.product_title, variant: item.variant_label, qty: item.quantity }));

// "<strong>Acacia Deck Tiles</strong>" for a single product, "<strong>3 products</strong>" otherwise.
const quoteProductsHtml = (items) => {
  const list = items || [];
  if (list.length === 1) return `<strong>${escapeHtml(list[0].product_title)}</strong>`;
  return `<strong>${list.length} products</strong>`;
};

// Transient network/soft-bounce errors worth a bounded retry; permanent
// failures (bad auth 535, invalid recipient 550, etc.) fail fast instead.
const RETRYABLE_ERROR = /ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|ESOCKET|421|450|451/i;

async function sendMailWithRetry(mailOptions, { attempts = 3, baseDelayMs = 500 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await transporter.sendMail(mailOptions);
    } catch (error) {
      lastError = error;
      const isRetryable = RETRYABLE_ERROR.test(error.code || error.responseCode || error.message || "");
      if (attempt === attempts || !isRetryable) throw error;
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * 2 ** (attempt - 1)));
    }
  }
  throw lastError;
}

class MailerService {
  /**
   * Resolves the "from" address for all outgoing admin emails: the
   * DB-configured SiteSettings.admin_email, falling back to EMAIL_FROM if no
   * SiteSettings row/admin_email exists yet. Shared by every mailer method so
   * the sender address is resolved once, not duplicated per email type.
   */
  static async getFromEmail() {
    const siteSettings = await models.SiteSettings.findOne();
    return siteSettings?.admin_email || EMAIL_FROM;
  }

  /**
   * Shared SMTP transactional-email send, factored out of sendOtpEmail so
   * every email type (OTP, contact-enquiry notification/confirmation) shares
   * one send/error-handling path instead of duplicating the nodemailer
   * boilerplate. Throws on any send failure, or if SMTP isn't configured, so
   * callers can tell a real provider failure apart from a handled-upstream case.
   */
  static async sendEmail({ toEmail, toName, subject, htmlContent, replyTo }) {
    const fromEmail = await MailerService.getFromEmail();
    const finalReplyTo = replyTo || fromEmail;

    if (!transportOptions.host || !transportOptions.auth?.user || !transportOptions.auth?.pass || !fromEmail) {
      throw new Error("Email provider is not configured (missing host/credentials/from address)");
    }

    try {
      const info = await sendMailWithRetry({
        from: { address: fromEmail, name: EMAIL_FROM_NAME || undefined },
        replyTo: finalReplyTo,
        to: toName ? { address: toEmail, name: toName } : toEmail,
        subject,
        html: htmlContent,
      });

      // A successful sendMail only means the message was accepted by the SMTP
      // server, not that it was delivered — log the messageId so a given send
      // can be cross-checked if the recipient reports non-delivery.
      Logger.info("SMTP email accepted", { messageId: info.messageId, subject, toEmail });
    } catch (error) {
      Logger.error("SMTP email send failed", { message: error.message, subject, toEmail });
      throw new Error(`SMTP email send failed: ${error.message}`);
    }
  }

  /**
   * Sends a one-time-password email for admin password resets.
   */
  static async sendOtpEmail(toEmail, otp) {
    return MailerService.sendEmail({
      toEmail,
      subject: "Your password reset code",
      htmlContent: renderEmailLayout({
        title: "Password Reset Code",
        preheader: "Your Z&S admin password reset code",
        introHtml: "Use the code below to reset your admin password. This code expires in 5 minutes.",
        bodyHtml: `<p style="margin: 0 0 25px; font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #0066b3">${escapeHtml(otp)}</p>
                <p style="margin: 0 0 25px; font-size: 13px; color: #555555">If you did not request this, you can safely ignore this email.</p>`,
        cta: null,
      }),
    });
  }

  /**
   * Notifies the site admin of a newly submitted contact enquiry. Reply-to is
   * set to the submitter's email so the admin can hit "reply" and it goes
   * straight to them.
   */
  static async sendContactEnquiryAdminNotification(enquiry) {
    const adminEmail = await MailerService.getFromEmail();
    return MailerService.sendEmail({
      toEmail: adminEmail,
      subject: oneLine(`New Contact Enquiry from ${enquiry.name}`),
      htmlContent: renderEmailLayout({
        title: "New Contact Enquiry",
        preheader: `New contact enquiry from ${enquiry.name}`,
        introHtml: `A new enquiry has been submitted through the website contact form.`,
        detailsTitle: "Enquiry Details",
        details: [
          { label: "Name", value: enquiry.name },
          { label: "Mobile", value: enquiry.phone },
          { label: "Email", value: enquiry.email, href: `mailto:${enquiry.email}` },
          enquiry.file
            ? { label: "Attachment", value: "Download file", href: `${BASE_URL}/${enquiry.file}` }
            : { label: "Attachment", value: "None" },
          { label: "Submitted on", value: formatDateTime(enquiry.createdAt) },
        ],
        messageTitle: "Requirements",
        message: enquiry.requirements,
        cta: { label: `Reply to ${enquiry.name}`, href: `mailto:${enquiry.email}` },
      }),
      replyTo: enquiry.email,
    });
  }

  /**
   * Sends a "we've received your enquiry" confirmation to the submitter.
   */
  static async sendContactEnquiryConfirmation(enquiry) {
    return MailerService.sendEmail({
      toEmail: enquiry.email,
      toName: enquiry.name,
      subject: `Enquiry Received`,
      htmlContent: renderEmailLayout({
        title: "Enquiry Received",
        preheader: "Thank you for contacting Z&S Carpets",
        greeting: { name: enquiry.name },
        introHtml: "Thank you for reaching out to us. Our team will review your requirements and get back to you within 24 hours.",
        details: [
          { label: "Mobile", value: enquiry.phone },
          { label: "Email", value: enquiry.email },
          { label: "Attachment", value: enquiry.file ? "Received" : "None" },
        ],
        messageTitle: "Your Requirements",
        message: enquiry.requirements,
      }),
    });
  }

  /**
   * Notifies the site admin of a new sample request (reply-to is the requester).
   */
  static async sendSampleRequestAdminNotification(request) {
    const adminEmail = await MailerService.getFromEmail();
    return MailerService.sendEmail({
      toEmail: adminEmail,
      subject: oneLine(`New Sample Request from ${request.name}`),
      htmlContent: renderEmailLayout({
        title: "New Sample Request",
        preheader: `Sample request for ${request.product_title} from ${request.name}`,
        introHtml: `A new sample request has been submitted for <strong>${escapeHtml(request.product_title)}</strong>.`,
        detailsTitle: "Request Details",
        details: [
          { label: "Category", value: request.category_title },
          { label: "Product", value: request.product_title },
          { label: "Name", value: request.name },
          { label: "Company", value: request.company_name },
          { label: "Mobile", value: request.phone },
          { label: "Email", value: request.email, href: `mailto:${request.email}` },
          { label: "Submitted on", value: formatDateTime(request.createdAt) },
        ],
        cta: { label: `Reply to ${request.name}`, href: `mailto:${request.email}` },
      }),
      replyTo: request.email,
    });
  }

  /**
   * Sends a "we've received your sample request" confirmation to the requester.
   */
  static async sendSampleRequestConfirmation(request) {
    return MailerService.sendEmail({
      toEmail: request.email,
      toName: request.name,
      subject: `Sample Request Received`,
      htmlContent: renderEmailLayout({
        title: "Sample Request Received",
        preheader: `We've received your sample request for ${request.product_title}`,
        greeting: { name: request.name },
        introHtml: `Thank you for requesting a sample of our <strong>${escapeHtml(request.product_title)}</strong>. Our team will get in touch within 24 hours to arrange it.`,
        detailsTitle: "Your Request Details",
        details: [
          { label: "Category", value: request.category_title },
          { label: "Product", value: request.product_title },
          { label: "Mobile", value: request.phone },
          { label: "Email", value: request.email },
          { label: "Company", value: request.company_name },
        ],
      }),
    });
  }

  /**
   * Notifies the site admin of a new download request (reply-to is the requester).
   */
  static async sendDownloadRequestAdminNotification(request) {
    const adminEmail = await MailerService.getFromEmail();
    const file = request.download_title || request.product_title;
    return MailerService.sendEmail({
      toEmail: adminEmail,
      subject: oneLine(`New Download Request from ${request.name}`),
      htmlContent: renderEmailLayout({
        title: "New Download Request",
        preheader: `Download request for ${file} from ${request.name}`,
        introHtml: `A new download request has been submitted for <strong>${escapeHtml(file)}</strong>. Please send the file to the requester.`,
        detailsTitle: "Request Details",
        details: [
          { label: "File", value: file },
          { label: "Source", value: request.download_id ? "Downloads library" : "Product datasheet" },
          { label: "Name", value: request.name },
          { label: "Company", value: request.company_name },
          { label: "Mobile", value: request.phone },
          { label: "Email", value: request.email, href: `mailto:${request.email}` },
          { label: "Submitted on", value: formatDateTime(request.createdAt) },
        ],
        cta: { label: `Reply to ${request.name}`, href: `mailto:${request.email}` },
      }),
      replyTo: request.email,
    });
  }

  /**
   * Sends a "we've received your download request" confirmation to the requester.
   */
  static async sendDownloadRequestConfirmation(request) {
    const file = request.download_title || request.product_title;
    return MailerService.sendEmail({
      toEmail: request.email,
      toName: request.name,
      subject: `Download Request Received`,
      htmlContent: renderEmailLayout({
        title: "Download Request Received",
        preheader: `We've received your request for ${file}`,
        greeting: { name: request.name },
        introHtml: `Thank you for your interest${file ? ` in <strong>${escapeHtml(file)}</strong>` : ""}. Our team will send the file to your email shortly.`,
        detailsTitle: "Your Request Details",
        details: [
          { label: "File", value: file },
          { label: "Company", value: request.company_name },
          { label: "Mobile", value: request.phone },
          { label: "Email", value: request.email },
        ],
      }),
    });
  }

  /**
   * Notifies the site admin of a new quote request (reply-to is the requester).
   * Lists every line item, unlike the single-product siblings above.
   */
  static async sendQuoteRequestAdminNotification(quoteRequest) {
    const adminEmail = await MailerService.getFromEmail();
    return MailerService.sendEmail({
      toEmail: adminEmail,
      subject: oneLine(`New Quote Request (${quoteRequest.reference_code}) from ${quoteRequest.name}`),
      htmlContent: renderEmailLayout({
        title: "New Quote Request",
        preheader: `Quote request ${quoteRequest.reference_code} from ${quoteRequest.name}`,
        introHtml: `A new quote request has been submitted for ${quoteProductsHtml(quoteRequest.items)}. Reference <strong>${escapeHtml(quoteRequest.reference_code)}</strong>.`,
        detailsTitle: "Inquiry Details",
        details: [
          { label: "Name", value: quoteRequest.name },
          { label: "Company", value: quoteRequest.company_name },
          { label: "Mobile", value: quoteRequest.phone },
          { label: "Email", value: quoteRequest.email, href: `mailto:${quoteRequest.email}` },
          { label: "Submitted on", value: formatDateTime(quoteRequest.createdAt) },
        ],
        items: quoteItems(quoteRequest.items),
        message: quoteRequest.message,
        cta: { label: `Reply to ${quoteRequest.name}`, href: `mailto:${quoteRequest.email}` },
      }),
      replyTo: quoteRequest.email,
    });
  }

  /**
   * Sends a "we've received your quote request" confirmation to the requester,
   * including the generated reference code so they can quote it in follow-ups.
   */
  static async sendQuoteRequestConfirmation(quoteRequest) {
    return MailerService.sendEmail({
      toEmail: quoteRequest.email,
      toName: quoteRequest.name,
      subject: `Inquiry Received (${quoteRequest.reference_code})`,
      htmlContent: renderEmailLayout({
        title: "Inquiry Received",
        preheader: "Thank you for your inquiry with Z&S Carpets",
        greeting: { name: quoteRequest.name, referenceId: quoteRequest.reference_code },
        introHtml: `Thank you for your inquiry about our ${quoteProductsHtml(quoteRequest.items)}. Our team will get back to you within 24 hours with a detailed response.`,
        details: [
          { label: "Mobile", value: quoteRequest.phone },
          { label: "Email", value: quoteRequest.email },
          { label: "Company", value: quoteRequest.company_name },
        ],
        items: quoteItems(quoteRequest.items),
        message: quoteRequest.message,
      }),
    });
  }
}

module.exports = MailerService;
