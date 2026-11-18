import UIKit
import WebKit
import Capacitor

/// A tela do app: a do Capacitor, mais o DOWNLOAD de arquivos.
///
/// O Capacitor não trata download. O "Baixar PDF" do orçamento (jsPDF) e a
/// exportação CSV usam `<a download href="blob:…">`, e dentro do app isso não
/// fazia nada: o Capacitor manda o `blob:` para o Safari, que não sabe abri-lo.
/// Aqui o arquivo é baixado e abre a folha de compartilhar do iPhone (Salvar em
/// Arquivos, WhatsApp, e-mail, imprimir).
///
/// ⚠️ Todo o resto continua sendo o Capacitor: `DownloadsDoApp` só intercepta
/// o que é download e repassa todas as outras chamadas para o delegate dele.
class CarboViewController: CAPBridgeViewController {
    // O navigationDelegate do WKWebView é `weak`: quem segura o intermediário é a tela.
    private var downloads: DownloadsDoApp?

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        guard let webView = webView, let original = webView.navigationDelegate else { return }
        let intermediario = DownloadsDoApp(original: original, tela: self)
        downloads = intermediario
        webView.navigationDelegate = intermediario
    }
}

final class DownloadsDoApp: NSObject, WKNavigationDelegate, WKDownloadDelegate {
    // O original (WebViewDelegationHandler) é mantido vivo pelo bridge do Capacitor.
    private weak var original: WKNavigationDelegate?
    private weak var tela: UIViewController?
    private var destinos: [ObjectIdentifier: URL] = [:]

    init(original: WKNavigationDelegate, tela: UIViewController) {
        self.original = original
        self.tela = tela
        super.init()
    }

    // MARK: o que não é download vai inteiro para o Capacitor

    override func responds(to aSelector: Selector!) -> Bool {
        if super.responds(to: aSelector) { return true }
        return original?.responds(to: aSelector) ?? false
    }

    override func forwardingTarget(for aSelector: Selector!) -> Any? {
        if let original = original, original.responds(to: aSelector) { return original }
        return super.forwardingTarget(for: aSelector)
    }

    // MARK: decidir se é download

    private static func ehArquivoGerado(_ url: URL?) -> Bool {
        guard let scheme = url?.scheme?.lowercased() else { return false }
        return scheme == "blob" || scheme == "data"
    }

    func webView(_ webView: WKWebView,
                 decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if navigationAction.shouldPerformDownload || Self.ehArquivoGerado(navigationAction.request.url) {
            decisionHandler(.download)
            return
        }
        // O resto é a regra do Capacitor (allowNavigation, links externos no Safari…).
        if let original = original,
           original.webView?(webView, decidePolicyFor: navigationAction, decisionHandler: decisionHandler) != nil {
            return
        }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView,
                 decidePolicyFor navigationResponse: WKNavigationResponse,
                 decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        // O que o WebView não sabe mostrar (zip, xlsx…) vira download em vez de erro.
        decisionHandler(navigationResponse.canShowMIMEType ? .allow : .download)
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
        download.delegate = self
    }

    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
        download.delegate = self
    }

    // MARK: WKDownloadDelegate

    func download(_ download: WKDownload,
                  decideDestinationUsing response: URLResponse,
                  suggestedFilename: String,
                  completionHandler: @escaping (URL?) -> Void) {
        // Uma pasta por download: o WKDownload falha se o arquivo já existir.
        let pasta = FileManager.default.temporaryDirectory
            .appendingPathComponent("downloads", isDirectory: true)
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        do {
            try FileManager.default.createDirectory(at: pasta, withIntermediateDirectories: true)
        } catch {
            completionHandler(nil)
            return
        }
        let nome = suggestedFilename.isEmpty ? "arquivo" : suggestedFilename
        let destino = pasta.appendingPathComponent(nome)
        destinos[ObjectIdentifier(download)] = destino
        completionHandler(destino)
    }

    func downloadDidFinish(_ download: WKDownload) {
        guard let arquivo = destinos.removeValue(forKey: ObjectIdentifier(download)) else { return }
        DispatchQueue.main.async { [weak self] in
            self?.compartilhar(arquivo)
        }
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        destinos.removeValue(forKey: ObjectIdentifier(download))
        DispatchQueue.main.async { [weak self] in
            guard let tela = self?.tela else { return }
            let alerta = UIAlertController(title: "Não foi possível baixar o arquivo",
                                           message: error.localizedDescription,
                                           preferredStyle: .alert)
            alerta.addAction(UIAlertAction(title: "OK", style: .default))
            tela.present(alerta, animated: true)
        }
    }

    private func compartilhar(_ arquivo: URL) {
        guard let tela = tela else { return }
        let folha = UIActivityViewController(activityItems: [arquivo], applicationActivities: nil)
        if let popover = folha.popoverPresentationController {
            popover.sourceView = tela.view
            popover.sourceRect = CGRect(x: tela.view.bounds.midX, y: tela.view.bounds.maxY - 1, width: 1, height: 1)
            popover.permittedArrowDirections = []
        }
        var topo: UIViewController = tela
        while let acima = topo.presentedViewController { topo = acima }
        topo.present(folha, animated: true)
    }
}
