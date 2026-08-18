export const metadata = {
  title: 'Privacy Policy — EMR Portal',
  description: 'Privacy policy for the EMR Portal web application and EMR Service mobile app.',
}

const section: React.CSSProperties = { marginBottom: 28 }
const h2: React.CSSProperties = { fontSize: 18, fontWeight: 700, color: '#1C0D14', marginBottom: 10 }
const p: React.CSSProperties = { fontSize: 14, lineHeight: 1.7, color: '#374151', marginBottom: 10 }
const li: React.CSSProperties = { fontSize: 14, lineHeight: 1.7, color: '#374151', marginBottom: 6 }

export default function PrivacyPolicyPage() {
  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '48px 24px 80px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, color: '#7D1D3F', marginBottom: 4 }}>Privacy Policy</h1>
      <p style={{ fontSize: 13, color: '#7A6870', marginBottom: 32 }}>Last updated: 17 August 2026</p>

      <div style={section}>
        <p style={p}>
          This policy describes how EMR Global (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) collects, uses, and protects
          information through the EMR Portal web application and the EMR Service mobile app
          (together, the &quot;Service&quot;). The Service is a field-service management platform used by
          EMR Global staff and field engineers to manage and document on-site work, and is not a
          public consumer app — access is limited to authorized personnel provisioned by EMR Global.
        </p>
      </div>

      <div style={section}>
        <h2 style={h2}>Information we collect</h2>
        <p style={p}>We collect the following categories of information:</p>
        <ul style={{ paddingLeft: 20, marginBottom: 10 }}>
          <li style={li}><strong>Account information:</strong> name, work email address, employee ID, phone number, department, and role, provided when an administrator creates your account.</li>
          <li style={li}><strong>Location data:</strong> GPS coordinates, captured when you check in at a job site, submit certain forms, while the app is open and your assigned status indicates you are traveling to or present at a site, or when you view the &quot;Nearby Engineers&quot; list on your dashboard. Location is used to route job assignments to the nearest available engineer, confirm site check-ins, remind you to update a job&apos;s status if you appear to have left a site without doing so, and show you (and other engineers) approximately how far away nearby colleagues are. We do not track location continuously or while the app is closed — each of these is a one-time capture tied to that specific action.</li>
          <li style={li}><strong>Photos and signatures:</strong> site photographs, damage photographs, and digital signatures you capture or upload while completing inspection forms, check-ins, or job closures.</li>
          <li style={li}><strong>Job and customer data:</strong> work order details, equipment/serial numbers, site addresses, and the name, phone number, and site contact details of the customer associated with a job — entered by EMR Global staff as part of normal service delivery, not collected directly from customers by the app.</li>
          <li style={li}><strong>Communication data:</strong> phone numbers used to deliver WhatsApp and push notifications about job assignments, status changes, and reminders.</li>
          <li style={li}><strong>Device and usage information:</strong> a device push-notification token, device name, and basic diagnostic information needed to deliver notifications and keep the app working correctly.</li>
        </ul>
      </div>

      <div style={section}>
        <h2 style={h2}>How we use this information</h2>
        <ul style={{ paddingLeft: 20, marginBottom: 10 }}>
          <li style={li}>To assign, dispatch, and track field service jobs, including suggesting the nearest available engineer for a new job.</li>
          <li style={li}>To let you check in/out of job sites, complete inspection and closure forms, and generate visit reports (PDF/Word documents) for completed work.</li>
          <li style={li}>To send you and, where applicable, the customer, notifications about job assignments, status changes, and reminders — via in-app alerts, push notifications, and WhatsApp messages.</li>
          <li style={li}>To remind you to update a job&apos;s status if your location suggests you have left a site you checked into.</li>
          <li style={li}>To show you other nearby field engineers (and show your approximate location to them) for on-site coordination, when you view the &quot;Nearby Engineers&quot; list.</li>
          <li style={li}>To maintain records required for service delivery, quality, and business reporting.</li>
        </ul>
      </div>

      <div style={section}>
        <h2 style={h2}>How information is shared</h2>
        <p style={p}>We do not sell your information. We share information only as needed to operate the Service:</p>
        <ul style={{ paddingLeft: 20, marginBottom: 10 }}>
          <li style={li}><strong>Amazon Web Services (AWS):</strong> our infrastructure provider. Account data, job data, photos, and documents are stored on AWS servers (Amazon RDS, Amazon S3) located in the ap-south-2 (Hyderabad) region, and authentication is handled by Amazon Cognito.</li>
          <li style={li}><strong>Google / Firebase Cloud Messaging and Expo:</strong> used to deliver push notifications to the mobile app. A device push token (not your personal messages) is shared with these providers for this purpose.</li>
          <li style={li}><strong>Combirds:</strong> our WhatsApp Business messaging provider, used to deliver WhatsApp notifications about job status to engineers and customers. The recipient&apos;s phone number and the message content (e.g. job number, names, scheduled dates) are shared with Combirds/WhatsApp to deliver these messages.</li>
        </ul>
        <p style={p}>We may also disclose information if required by law, or to protect the rights, property, or safety of EMR Global, our staff, or others.</p>
      </div>

      <div style={section}>
        <h2 style={h2}>Data retention</h2>
        <p style={p}>
          We retain account, job, and location data for as long as your account is active and as
          needed for business records, service history, and legal/compliance purposes. Location
          data captured for a specific check-in or status update is retained as part of that job&apos;s
          record; we do not build a continuous location history beyond what is needed for these
          job-specific records.
        </p>
      </div>

      <div style={section}>
        <h2 style={h2}>Data security</h2>
        <p style={p}>
          We use industry-standard safeguards to protect your information, including encrypted
          connections (HTTPS/TLS), role-based access controls, and cloud infrastructure with
          restricted network access. No method of transmission or storage is 100% secure, and we
          cannot guarantee absolute security.
        </p>
      </div>

      <div style={section}>
        <h2 style={h2}>Your choices</h2>
        <ul style={{ paddingLeft: 20, marginBottom: 10 }}>
          <li style={li}>Location permission can be declined or revoked in your device settings; some features (check-in, nearest-engineer assignment, site-drift reminders) will not work without it.</li>
          <li style={li}>Push notification permission can be declined or revoked in your device settings at any time.</li>
          <li style={li}>To request access to, correction of, or deletion of your personal information, contact us using the details below. Since accounts are provisioned by EMR Global for work purposes, some requests may need to be handled by your administrator.</li>
        </ul>
      </div>

      <div style={section}>
        <h2 style={h2}>Children&apos;s privacy</h2>
        <p style={p}>
          The Service is intended for use by adult employees and contractors of EMR Global in the
          course of their work. It is not directed at, and we do not knowingly collect information
          from, children.
        </p>
      </div>

      <div style={section}>
        <h2 style={h2}>Changes to this policy</h2>
        <p style={p}>
          We may update this policy from time to time. Material changes will be reflected by
          updating the &quot;Last updated&quot; date above.
        </p>
      </div>

      <div style={section}>
        <h2 style={h2}>Contact us</h2>
        <p style={p}>
          If you have questions about this policy or how your information is handled, contact us at{' '}
          <a href="mailto:admin@emrglobal.com" style={{ color: '#7D1D3F' }}>admin@emrglobal.com</a>.
        </p>
      </div>
    </div>
  )
}
