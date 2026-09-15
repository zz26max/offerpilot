import {formatStatus, localizeApiMessage} from "./messages";

describe("中文界面文案", () => {
    it("保留 API 枚举值并返回对应的中文标签", () => {
        expect(formatStatus("OPEN")).toBe("招聘中");
        expect(formatStatus("REVIEWING")).toBe("筛选中");
        expect(formatStatus("ROLE_ADMIN")).toBe("管理员");
        expect(formatStatus("QUEUED")).toBe("等待解析");
        expect(formatStatus("SUCCEEDED")).toBe("解析完成");
    });

    it("允许调用方指定空状态文案", () => {
        expect(formatStatus(null, "未投递")).toBe("未投递");
    });

    it("将后端错误转换为面向用户的中文提示", () => {
        expect(localizeApiMessage("Title is required", "保存失败。"))
            .toBe("请输入岗位名称。");
        expect(localizeApiMessage("Job with id 42 was not found", "保存失败。"))
            .toBe("未找到该岗位。");
    });

    it("不会把未知的英文错误直接展示给用户", () => {
        expect(localizeApiMessage("Internal implementation detail", "暂时无法完成操作。"))
            .toBe("暂时无法完成操作。");
    });
});
